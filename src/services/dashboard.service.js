const { prisma } = require("../lib/prisma");
const flowService = require("./flow.service");

class DashboardService {
  // SINGLE source of truth for every dashboard flow query. Delegates to
  // flow.service so dashboard counts are guaranteed identical to the flows
  // the user actually sees on the flows page (DATA-LOSS-001).
  //
  //   - Team context (verified member/owner) → { ownerId, workspaceId }: the
  //     caller's OWN flows in that team — never workspaceId alone (other members'
  //     rows), never the flow.appContext column.
  //   - Team context WITHOUT access → silently fall back to personal so we
  //     never leak another team's data and never 403 a read-only dashboard.
  //   - Personal context (no workspaceId) → flow.service's canonical workspace
  //     scope (workspaceId buckets: NULL-team + owned team-app teams, or the
  //     pro-team for pro users). Never filters by the appContext column.
  //
  // Returns a full ownerId-bounded `where` with `deletedAt: null`, merged
  // with any `extra` filters the caller needs (date ranges, non-empty, etc).
  async _flowWhere(userId, appContext, workspaceId, extra = {}) {
    // Delegate to flow.service so dashboard counts can never diverge from the
    // flows list (DATA-LOSS-001). resolveWorkspaceScope verifies the requested
    // workspace server-side and falls back to the caller's own, so the explicit
    // membership check that used to live here is no longer needed.
    const scope = await flowService.resolveWorkspaceScope(
      userId,
      appContext,
      workspaceId,
    );
    return { ...scope, deletedAt: null, ...extra };
  }

  async getStats(userId, appContext = "free", workspaceId = null) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Canonical workspace scope — same as the flows list, with membership
    // validated for any team context.
    const base = await this._flowWhere(userId, appContext, workspaceId);

    const [totalFlows, editedThisMonth, sharedFlows, teamMembers] =
      await Promise.all([
        prisma.flow.count({ where: base }),
        prisma.flow.count({
          where: { ...base, updatedAt: { gte: startOfMonth } },
        }),
        // Shared flows = flows the caller has shared with others. FlowShare has
        // no workspaceId column, but it DOES carry appContext — so we scope by app
        // (B49): the Pro dashboard must not count Team-app shares and vice-versa
        // (cross-app isolation). Mirrors getSharedFlows' appContext anchor and
        // the Free-fold (team app shows team+free). Pro stays strictly isolated.
        prisma.flowShare.count({
          where: {
            sharedById: userId,
            appContext: appContext === "pro" ? "pro" : { in: ["team", "free"] },
          },
        }),
        this._getOwnedTeamMemberCount(userId, workspaceId, appContext),
      ]);

    return { totalFlows, editedThisMonth, sharedFlows, teamMembers };
  }

  async getActivity(userId, appContext = "free", workspaceId = null) {
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
    const base = await this._flowWhere(userId, appContext, workspaceId);

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

  async getRecentFlows(userId, appContext = "free", limit = 5, workspaceId = null) {
    // B26/B38: the recent list must match the `totalFlows` count, which counts
    // ALL non-deleted flows. Previously this filtered `diagramData != ""`, so a
    // just-created (still-empty) flow bumped Total Flows but never appeared in
    // Recent ("No recent flows" / "2 of 5"). Drop the content filter so newly
    // created flows show up (empty ones fall back to a placeholder thumbnail).
    const flows = await prisma.flow.findMany({
      where: await this._flowWhere(userId, appContext, workspaceId),
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

  async getTeamActivity(userId, limit = 10, workspaceId = null, appContext = null) {
    // owner-as-workspace (2026-08-07): everything inside a workspace is shared,
    // so this is the workspace's recent activity — no longer restricted to the
    // caller's own rows. With no explicit workspace it covers every workspace
    // the caller can enter (their own plus each team owner's).
    let workspaceIds;
    if (workspaceId) {
      const { canEnterWorkspace } = require("../lib/workspaceScope");
      if (!(await canEnterWorkspace(userId, workspaceId))) return [];
      workspaceIds = [workspaceId];
    } else {
      const { accessibleWorkspaceIds } = require("../lib/workspaceScope");
      workspaceIds = await accessibleWorkspaceIds(userId);
    }

    if (workspaceIds.length === 0) return [];

    // bug-M5: scope by app context so a Team-app feed never surfaces Pro-app
    // flows (mirrors every other dashboard list).
    const { appScope } = require("../lib/workspaceScope");
    const recentFlows = await prisma.flow.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        deletedAt: null,
        ...appScope(appContext),
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        updatedAt: true,
        createdAt: true,
        workspace: { select: { id: true, name: true, image: true } },
      },
    });

    return recentFlows.map((f) => ({
      id: f.id,
      flowName: f.name,
      userName: f.workspace?.name || "Unknown",
      // bug-M5: was `f.owner?.image` — `owner` is never selected, so the avatar
      // was always null. The selected relation is `workspace`.
      userImage: f.workspace?.image || null,
      action:
        f.createdAt.getTime() === f.updatedAt.getTime() ? "created" : "edited",
      timestamp: f.updatedAt,
    }));
  }

  // "Team Members" stat = distinct non-self members in the active team bucket.
  //
  // With workspaceId (explicit workspace context): count members of that specific
  // team, verifying the caller is a member or owner first.
  //
  // Without workspaceId (overview / no active context): aggregate unique members
  // across ALL non-system owned teams (scoped by appContext so pro teams are
  // excluded when viewing the team dashboard and vice-versa). This prevents
  // the old findFirst fallback from landing on a system team (1 member = self
  // only) and incorrectly returning 0.
  // Distinct members of `ownerWorkspaceId`'s teams, restricted to the app the
  // dashboard is showing, excluding `excludeUserId` (the viewer). ONE definition
  // for both the active-workspace and the aggregate/personal branch so the two
  // can never diverge (bug-136 fixed the aggregate branch; bug-U5 the active
  // one, which counted across BOTH apps' seats while its roster did not).
  //
  // owner-as-workspace (2026-08-07): a member carries `workspaceId = the OWNER's
  // id` (NOT a team id) and names the specific teams in the `teamIds[]` array —
  // so scope by the owner's workspace and intersect `teamIds` with the
  // appContext-filtered owned teams (never `workspaceId IN (team ids)`).
  async _countWorkspaceMembers(ownerWorkspaceId, appContext, excludeUserId) {
    const teamWhere = {
      teamOwnerId: ownerWorkspaceId,
      deletedAt: null,
      AND: [{ OR: [{ verifyTeam: null }, { verifyTeam: { not: "system" } }] }],
    };
    if (appContext === "pro") {
      teamWhere.appContext = "pro";
    } else if (appContext && appContext !== "free") {
      teamWhere.appContext = { not: "pro" };
    }

    const teams = await prisma.team.findMany({
      where: teamWhere,
      select: { id: true },
    });
    if (!teams.length) return 0;

    const members = await prisma.teamMember.findMany({
      where: {
        workspaceId: ownerWorkspaceId,
        userId: { not: excludeUserId },
        teamIds: { hasSome: teams.map((t) => t.id) },
      },
      select: { userId: true },
    });
    return new Set(members.map((m) => m.userId)).size;
  }

  async _getOwnedTeamMemberCount(userId, workspaceId = null, appContext = null) {
    if (workspaceId) {
      // Only owners/members of the active workspace get a count (fail-closed).
      // bug-M10: the old gate paired the membership check with
      // `team.findFirst({ id: workspaceId })` — but `workspaceId` is a USER id
      // (owner-as-workspace), never a team PK, so that half always returned
      // null and the gate worked only because createTeam writes an owner
      // self-membership row. `canEnterWorkspace` is the canonical check (own
      // workspace OR a live seat) and removes the dead branch.
      const { canEnterWorkspace } = require("../lib/workspaceScope");
      if (!(await canEnterWorkspace(userId, workspaceId))) return 0;
      // The active workspace's owner IS `workspaceId` (owner-as-workspace).
      return this._countWorkspaceMembers(workspaceId, appContext, userId);
    }

    // No active workspace → the caller's own workspace.
    return this._countWorkspaceMembers(userId, appContext, userId);
  }
}

module.exports = new DashboardService();
