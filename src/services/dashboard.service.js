const { prisma } = require("../lib/prisma");

class DashboardService {
  // Resolve the workspace scope for this request.
  //   - Personal context (no teamId) → caller's personal flows only:
  //       { ownerId: userId, teamId: null }
  //   - Team context (verified member/owner) → that team's flows only:
  //       { teamId: <activeTeamId> }
  //     Team-owner's personal flows and the caller's personal flows are
  //     intentionally excluded — they belong to the personal workspace.
  //   - Team context without access → silently fall back to personal so
  //     we never leak another team's data.
  async _resolveScope(userId, teamId) {
    if (!teamId) return { scope: "personal", userId };
    const [membership, ownedTeam] = await Promise.all([
      prisma.teamMember.findFirst({
        where: { teamId, userId },
        select: { id: true },
      }),
      prisma.team.findFirst({
        where: { id: teamId, teamOwnerId: userId },
        select: { id: true },
      }),
    ]);
    if (!membership && !ownedTeam) return { scope: "personal", userId };
    return { scope: "team", teamId, userId };
  }

  // Build the Flow `where` clause for stats/activity/recent queries.
  // Own account (personal scope, no teamId) counts ALL the caller's flows
  // (free-era included) — same account, plan upgrade never hides data. A
  // joined team counts only the caller's flows in it: { ownerId, teamId } —
  // never teamId alone (other members' flows: DATA-LOSS-001).
  _flowWhere(scopeInfo, appContext, extra = {}) {
    if (scopeInfo.scope === "team") {
      return { ownerId: scopeInfo.userId, teamId: scopeInfo.teamId, ...extra };
    }
    return {
      ownerId: scopeInfo.userId,
      appContext: appContext || "free",
      ...extra,
    };
  }

  async getStats(userId, appContext = "free", teamId = null) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Scope the flow counts to the active workspace:
    //   - team context  → caller's own flows in that team
    //   - personal      → caller's own flows in the active appContext
    const flowWhere = teamId
      ? { ownerId: userId, teamId, deletedAt: null }
      : { ownerId: userId, appContext, deletedAt: null };

    const [totalFlows, editedThisMonth, sharedFlows, teamMembers] =
      await Promise.all([
        prisma.flow.count({ where: flowWhere }),
        prisma.flow.count({
          where: { ...flowWhere, updatedAt: { gte: startOfMonth } },
        }),
        // Shared flows scoped to the same appContext (team context uses teamId implicitly).
        teamId
          ? prisma.flowShare.count({ where: { sharedById: userId } })
          : prisma.flowShare.count({
              where: { sharedById: userId, appContext },
            }),
        this._getOwnedTeamMemberCount(userId),
      ]);

    return { totalFlows, editedThisMonth, sharedFlows, teamMembers };
  }

  async getActivity(userId, appContext = "free", teamId = null) {
    const scopeInfo = await this._resolveScope(userId, teamId);
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const [created, edited] = await Promise.all([
        prisma.flow.count({
          where: this._flowWhere(scopeInfo, appContext, {
            createdAt: { gte: date, lt: nextDate },
          }),
        }),
        prisma.flow.count({
          where: this._flowWhere(scopeInfo, appContext, {
            deletedAt: null,
            updatedAt: { gte: date, lt: nextDate },
            createdAt: { lt: date },
          }),
        }),
      ]);

      days.push({
        date: date.toISOString().split("T")[0],
        label: date.toLocaleDateString("en-US", { weekday: "short" }),
        created,
        edited,
      });
    }

    return days;
  }

  async getRecentFlows(userId, appContext = "free", limit = 5, teamId = null) {
    const scopeInfo = await this._resolveScope(userId, teamId);
    const flows = await prisma.flow.findMany({
      where: this._flowWhere(scopeInfo, appContext, {
        deletedAt: null,
        diagramData: { not: "" },
      }),
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        thumbnail: true,
        updatedAt: true,
        isFavorite: true,
      },
    });
    return flows;
  }

  async getTeamActivity(userId, limit = 10, teamId = null) {
    // Private team buckets: members never see each other's data, so this is
    // the CALLER'S own recent activity inside the active team bucket (owner
    // AND team — never other members' rows: DATA-LOSS-001). Personal context
    // returns [] — the caller hides the section there.
    let teamIds;
    if (teamId) {
      const membership = await prisma.teamMember.findFirst({
        where: { teamId, userId },
        select: { id: true },
      });
      const owns = await prisma.team.findFirst({
        where: { id: teamId, teamOwnerId: userId },
        select: { id: true },
      });
      if (!membership && !owns) return [];
      teamIds = [teamId];
    } else {
      const teamMembers = await prisma.teamMember.findMany({
        where: { userId },
        select: { teamId: true },
      });
      teamIds = teamMembers.map((tm) => tm.teamId);
    }

    if (teamIds.length === 0) return [];

    const recentFlows = await prisma.flow.findMany({
      where: {
        ownerId: userId,
        teamId: { in: teamIds }, // caller's own flows in these team buckets
        deletedAt: null,
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        updatedAt: true,
        createdAt: true,
        owner: { select: { id: true, name: true, image: true } },
      },
    });

    return recentFlows.map((f) => ({
      id: f.id,
      flowName: f.name,
      userName: f.owner?.name || "Unknown",
      userImage: f.owner?.image || null,
      action:
        f.createdAt.getTime() === f.updatedAt.getTime() ? "created" : "edited",
      timestamp: f.updatedAt,
    }));
  }

  // "Team Members" stat = distinct members of the team this user OWNS
  // (excludes self). A user who has only JOINED teams owns none → 0.
  async _getOwnedTeamMemberCount(userId) {
    const ownTeam = await prisma.team.findFirst({
      where: { teamOwnerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!ownTeam) return 0;

    const members = await prisma.teamMember.findMany({
      where: { teamId: ownTeam.id, userId: { not: userId } },
      select: { userId: true },
    });

    return new Set(members.map((m) => m.userId)).size;
  }
}

module.exports = new DashboardService();
