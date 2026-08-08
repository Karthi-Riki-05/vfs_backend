// Workspace resolution — the single authority on "which workspace is this
// request allowed to read and write?".
//
// Owner decision (2026-08-07): **a workspace IS the tenant owner.**
// `workspace_id` on flows/shapes/shape_groups/projects/issues/notifications/
// chat_groups/ai_jobs holds a USER id, never a team id. Teams are no longer
// data boundaries — membership decides which workspace you may ENTER, and
// everything inside a workspace is shared across all of that owner's teams.
//
// That makes scoping a single equality (`{ workspaceId }`) instead of the old
// `OR: [{ teamId: null }, { teamId: { in: ownedTeamIds } }]`, and it removes
// the NULL-means-personal rule that caused bug-094: a personal row now carries
// the user's own id, so nothing can silently "become personal".
//
// SECURITY: the requested workspace arrives on a CLIENT header
// (X-Workspace-Context). It is a claim, never a grant — `resolveWorkspaceId`
// verifies membership server-side and falls back to the caller's own workspace
// when the claim does not hold. See docs/xc-security.md.

const { prisma } = require("../lib/prisma");

/**
 * Every workspace this user may enter: their own, plus the owner of every
 * non-deleted team they belong to.
 * @returns {Promise<string[]>} user ids
 */
async function accessibleWorkspaceIds(userId) {
  if (!userId) return [];
  // CHANGE-001: workspace membership is a COLUMN now, not a join through the
  // team — and it survives team deletion, so a person keeps workspace access
  // after their last team is removed. Only removeFromWorkspace revokes it.
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  const ids = new Set([userId]);
  for (const m of memberships) {
    if (m.workspaceId) ids.add(m.workspaceId);
  }
  return [...ids];
}

/**
 * Resolve the workspace a request should operate in.
 *
 * @param {string} userId              the authenticated caller
 * @param {string|null} requested      X-Workspace-Context (a claim)
 * @returns {Promise<string>}          the workspace id to scope by
 */
async function resolveWorkspaceId(userId, requested = null) {
  if (!requested || requested === userId) return userId;
  const allowed = await canEnterWorkspace(userId, requested);
  // Not a member (or the team was deleted) → their own workspace, never the
  // claimed one. Silent fallback rather than a 403: the header can legitimately
  // be stale after a team is deleted or a member is removed.
  return allowed ? requested : userId;
}

/**
 * Is this user allowed inside that workspace? True for their own, or when they
 * belong to any live team owned by that user.
 */
async function canEnterWorkspace(userId, workspaceId) {
  if (!userId || !workspaceId) return false;
  if (workspaceId === userId) return true;
  // CHANGE-001: one row per (person, workspace) — a single lookup, and no
  // longer conditional on the person still being in a live team.
  // findFirst rather than findUnique: @@unique([userId, workspaceId]) means at
  // most one row matches either way, and findFirst keeps this readable as a
  // plain predicate.
  const membership = await prisma.teamMember.findFirst({
    where: { userId, workspaceId },
    select: { id: true },
  });
  return !!membership;
}

/**
 * The APP boundary. The workspace says *whose* data this is; appContext says
 * *which app* it belongs to, keeping the Pro app isolated from the Team app for
 * the same person. That separation used to ride on the team boundary (Pro flows
 * lived in a hidden Pro team) and had to be re-homed here when teams stopped
 * being boundaries.
 *
 * ⚠️ DATA-LOSS-001: the Team app must match `free` OR `team`, never `team`
 * alone. A free user's rows are stored as `free`, so an exact match would make
 * every pre-upgrade diagram vanish the moment they bought a plan. That is the
 * original data-loss bug — see tests/flow.data.preservation.test.js.
 */
function appScope(appContext) {
  if (!appContext) return {};
  return {
    appContext: appContext === "pro" ? "pro" : { in: ["free", "team"] },
  };
}

/**
 * The where-clause fragment every workspace-scoped query merges in:
 * one equality for the workspace, plus the app boundary.
 * No OR over owned teams, no null branch.
 */
async function workspaceScope(userId, requested = null, appContext = null) {
  return {
    workspaceId: await resolveWorkspaceId(userId, requested),
    ...appScope(appContext),
  };
}

module.exports = {
  accessibleWorkspaceIds,
  resolveWorkspaceId,
  canEnterWorkspace,
  workspaceScope,
  appScope,
};
