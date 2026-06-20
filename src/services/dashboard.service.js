const { prisma } = require("../lib/prisma");
const flowService = require("./flow.service");

class DashboardService {
  // SINGLE source of truth for every dashboard flow query. Delegates to
  // flow.service so dashboard counts are guaranteed identical to the flows
  // the user actually sees on the flows page (DATA-LOSS-001).
  //
  //   - Team context (verified member/owner) → { ownerId, teamId }: the
  //     caller's OWN flows in that team — never teamId alone (other members'
  //     rows), never the flow.appContext column.
  //   - Team context WITHOUT access → silently fall back to personal so we
  //     never leak another team's data and never 403 a read-only dashboard.
  //   - Personal context (no teamId) → flow.service's canonical workspace
  //     scope (teamId buckets: NULL-team + owned team-app teams, or the
  //     pro-team for pro users). Never filters by the appContext column.
  //
  // Returns a full ownerId-bounded `where` with `deletedAt: null`, merged
  // with any `extra` filters the caller needs (date ranges, non-empty, etc).
  async _flowWhere(userId, appContext, teamId, extra = {}) {
    if (teamId) {
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
      if (membership || ownedTeam) {
        return { ownerId: userId, teamId, deletedAt: null, ...extra };
      }
      // Unverified team → personal fallback (no leak, no hard error).
    }
    const scope = await flowService.resolveWorkspaceScope(
      userId,
      appContext,
      null,
    );
    return { ownerId: userId, deletedAt: null, ...scope, ...extra };
  }

  async getStats(userId, appContext = "free", teamId = null) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Canonical workspace scope — same as the flows list, with membership
    // validated for any team context.
    const base = await this._flowWhere(userId, appContext, teamId);

    const [totalFlows, editedThisMonth, sharedFlows, teamMembers] =
      await Promise.all([
        prisma.flow.count({ where: base }),
        prisma.flow.count({
          where: { ...base, updatedAt: { gte: startOfMonth } },
        }),
        // Shared flows = flows the caller has shared with others. FlowShare
        // has no teamId column, so we cannot isolate shares by team bucket;
        // count all of the caller's shares regardless of app mode — share
        // counts must never be hidden by the active context (DATA-LOSS-001).
        prisma.flowShare.count({ where: { sharedById: userId } }),
        this._getOwnedTeamMemberCount(userId),
      ]);

    return { totalFlows, editedThisMonth, sharedFlows, teamMembers };
  }

  async getActivity(userId, appContext = "free", teamId = null) {
    const now = new Date();
    const ranges = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      ranges.push({ date, nextDate });
    }

    // Resolve the workspace scope ONCE (one membership lookup), then reuse it
    // for every day-count — the scope is identical across the window.
    const base = await this._flowWhere(userId, appContext, teamId);

    // Issue all 14 day-counts in one batch instead of 7 serial round-trips.
    const counts = await Promise.all(
      ranges.flatMap(({ date, nextDate }) => [
        prisma.flow.count({
          where: { ...base, createdAt: { gte: date, lt: nextDate } },
        }),
        prisma.flow.count({
          where: {
            ...base,
            updatedAt: { gte: date, lt: nextDate },
            createdAt: { lt: date },
          },
        }),
      ]),
    );

    return ranges.map(({ date }, idx) => ({
      date: date.toISOString().split("T")[0],
      label: date.toLocaleDateString("en-US", { weekday: "short" }),
      created: counts[idx * 2],
      edited: counts[idx * 2 + 1],
    }));
  }

  async getRecentFlows(userId, appContext = "free", limit = 5, teamId = null) {
    const flows = await prisma.flow.findMany({
      where: await this._flowWhere(userId, appContext, teamId, {
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
      const [membership, owns] = await Promise.all([
        prisma.teamMember.findFirst({
          where: { teamId, userId },
          select: { id: true },
        }),
        prisma.team.findFirst({
          where: { id: teamId, teamOwnerId: userId },
          select: { id: true },
        }),
      ]);
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
