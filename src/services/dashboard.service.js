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
    return { scope: "team", teamId };
  }

  // Build the Flow `where` clause for stats/activity/recent queries.
  // Personal scope keeps the appContext filter (Pro app vs Team app
  // separation). Team scope is keyed purely on team_id — every flow
  // tagged to that team is visible regardless of who created it.
  _flowWhere(scopeInfo, appContext, extra = {}) {
    if (scopeInfo.scope === "team") {
      return { teamId: scopeInfo.teamId, ...extra };
    }
    return {
      ownerId: scopeInfo.userId,
      teamId: null,
      appContext,
      ...extra,
    };
  }

  async getStats(userId, appContext = "free", teamId = null) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const scopeInfo = await this._resolveScope(userId, teamId);

    const [totalFlows, editedThisMonth, sharedFlows, teamMembers] =
      await Promise.all([
        prisma.flow.count({
          where: this._flowWhere(scopeInfo, appContext, {
            deletedAt: null,
          }),
        }),
        prisma.flow.count({
          where: this._flowWhere(scopeInfo, appContext, {
            deletedAt: null,
            updatedAt: { gte: startOfMonth },
          }),
        }),
        // Shared flows: scoped to the active workspace. In team context
        // count shares created within that team's flows; in personal
        // context, the caller's own shares.
        prisma.flowShare.count({
          where:
            scopeInfo.scope === "team"
              ? { flow: { teamId: scopeInfo.teamId, deletedAt: null } }
              : { sharedById: userId, appContext },
        }),
        this._getTeamMemberCount(userId),
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
    // App-isolation: when a teamId is provided, scope strictly to that
    // single team (and verify membership). Personal context returns [] —
    // the caller already hides the section in that case.
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

    const allMembers = await prisma.teamMember.findMany({
      where: { teamId: { in: teamIds } },
      select: { userId: true },
    });
    const memberIds = [...new Set(allMembers.map((m) => m.userId))];

    const recentFlows = await prisma.flow.findMany({
      where: {
        ownerId: { in: memberIds.filter((id) => id !== userId) },
        teamId: { in: teamIds }, // strictly scope flows to the same teams
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

  async _getTeamMemberCount(userId) {
    const teamMembers = await prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const teamIds = teamMembers.map((tm) => tm.teamId);

    if (teamIds.length === 0) return 0;

    const members = await prisma.teamMember.findMany({
      where: { teamId: { in: teamIds }, userId: { not: userId } },
      select: { userId: true },
    });

    return new Set(members.map((m) => m.userId)).size;
  }
}

module.exports = new DashboardService();
