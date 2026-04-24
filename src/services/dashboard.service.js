const { prisma } = require("../lib/prisma");

class DashboardService {
  // Resolve the set of owner IDs whose flows this request should see.
  // - Personal context (no teamId) → just the caller.
  // - Team context → caller + team owner, but only if the caller is a
  //   verified member (or the owner) of that team. Otherwise silently
  //   fall back to personal to avoid leaking data.
  async _resolveOwnerIds(userId, teamId) {
    if (!teamId) return { ownerIds: [userId], teamScoped: false };
    const [membership, ownedTeam, team] = await Promise.all([
      prisma.teamMember.findFirst({
        where: { teamId, userId },
        select: { id: true },
      }),
      prisma.team.findFirst({
        where: { id: teamId, teamOwnerId: userId },
        select: { id: true },
      }),
      prisma.team.findUnique({
        where: { id: teamId },
        select: { teamOwnerId: true },
      }),
    ]);
    if (!membership && !ownedTeam)
      return { ownerIds: [userId], teamScoped: false };
    const ownerIds =
      team?.teamOwnerId && team.teamOwnerId !== userId
        ? [userId, team.teamOwnerId]
        : [userId];
    return { ownerIds, teamScoped: true };
  }

  // Build the shared Flow `where` clause for stats/activity/recent queries.
  _flowWhere(ownerIds, appContext, teamScoped, extra = {}) {
    const base =
      ownerIds.length > 1
        ? { ownerId: { in: ownerIds } }
        : { ownerId: ownerIds[0] };
    // Personal queries keep the appContext filter for backward compat.
    // Team queries intentionally span contexts — team-plan flows live
    // under appContext='team' while personal ones live under 'free'.
    if (!teamScoped) base.appContext = appContext;
    return { ...base, ...extra };
  }

  async getStats(userId, appContext = "free", teamId = null) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const { ownerIds, teamScoped } = await this._resolveOwnerIds(
      userId,
      teamId,
    );

    const [totalFlows, editedThisMonth, sharedFlows, teamMembers] =
      await Promise.all([
        prisma.flow.count({
          where: this._flowWhere(ownerIds, appContext, teamScoped, {
            deletedAt: null,
          }),
        }),
        prisma.flow.count({
          where: this._flowWhere(ownerIds, appContext, teamScoped, {
            deletedAt: null,
            updatedAt: { gte: startOfMonth },
          }),
        }),
        // Shared flows: still counted per user (caller is the sharer).
        prisma.flowShare.count({
          where: teamScoped
            ? { sharedById: { in: ownerIds } }
            : { sharedById: userId, appContext },
        }),
        this._getTeamMemberCount(userId),
      ]);

    return { totalFlows, editedThisMonth, sharedFlows, teamMembers };
  }

  async getActivity(userId, appContext = "free", teamId = null) {
    const { ownerIds, teamScoped } = await this._resolveOwnerIds(
      userId,
      teamId,
    );
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
          where: this._flowWhere(ownerIds, appContext, teamScoped, {
            createdAt: { gte: date, lt: nextDate },
          }),
        }),
        prisma.flow.count({
          where: this._flowWhere(ownerIds, appContext, teamScoped, {
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
    const { ownerIds, teamScoped } = await this._resolveOwnerIds(
      userId,
      teamId,
    );
    const flows = await prisma.flow.findMany({
      where: this._flowWhere(ownerIds, appContext, teamScoped, {
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

  async getTeamActivity(userId, limit = 10) {
    const teamMembers = await prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const teamIds = teamMembers.map((tm) => tm.teamId);

    if (teamIds.length === 0) return [];

    const allMembers = await prisma.teamMember.findMany({
      where: { teamId: { in: teamIds } },
      select: { userId: true },
    });
    const memberIds = [...new Set(allMembers.map((m) => m.userId))];

    const recentFlows = await prisma.flow.findMany({
      where: {
        ownerId: { in: memberIds.filter((id) => id !== userId) },
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
