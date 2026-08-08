// Team membership helpers — CHANGE-001 (2026-08-07).
//
// `team_members` now holds ONE ROW PER (person, workspace). The teams a person
// belongs to live in the `teamIds` scalar array, so Prisma has no `Team.members`
// relation any more: a roster is a QUERY, never a nested include, and
// `members: { some: { userId } }` has no equivalent.
//
// Everything that used to lean on that relation goes through this module so the
// call sites cannot drift apart again.
//
// ⚠️ A scalar array cannot carry a foreign key. `removeTeamFromMembers` MUST run
// in the same transaction as a team delete or the id is orphaned in the array.

const { prisma } = require("./prisma");

/**
 * The team ids a user belongs to (across every workspace they are in).
 * @returns {Promise<string[]>}
 */
async function memberTeamIds(userId) {
  if (!userId) return [];
  const rows = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamIds: true },
  });
  return [...new Set(rows.flatMap((r) => r.teamIds || []))];
}

/**
 * The team ids a user belongs to inside ONE workspace.
 * @returns {Promise<string[]>}
 */
async function memberTeamIdsInWorkspace(userId, workspaceId, appContext = null) {
  if (!userId || !workspaceId) return [];
  // Seats are per-app now, so (userId, workspaceId) is no longer unique — a
  // findUnique on the old two-part key would throw. Without an appContext this
  // returns the union across both apps, which is what every current caller
  // wants ("which teams is this person in here?"); pass one to narrow it.
  const rows = await prisma.teamMember.findMany({
    where: {
      userId,
      workspaceId,
      ...(appContext ? { appContext } : {}),
    },
    select: { teamIds: true },
  });
  return [...new Set(rows.flatMap((r) => r.teamIds || []))];
}

/** Is this user in that specific team? */
async function isTeamMember(userId, teamId) {
  if (!userId || !teamId) return false;
  const row = await prisma.teamMember.findFirst({
    where: { userId, teamIds: { has: teamId } },
    select: { id: true },
  });
  return !!row;
}

/** Membership rows for one team, newest last. Replaces `where: { teamId }`. */
async function teamMemberRows(teamId, { includeUser = false } = {}) {
  if (!teamId) return [];
  return prisma.teamMember.findMany({
    where: { teamIds: { has: teamId } },
    ...(includeUser
      ? {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        }
      : {}),
    orderBy: { createdAt: "asc" },
  });
}

/** How many people are in this team. Replaces `count({ where: { teamId } })`. */
async function teamMemberCount(teamId) {
  if (!teamId) return 0;
  return prisma.teamMember.count({ where: { teamIds: { has: teamId } } });
}

/**
 * The `where` fragment selecting every Team a user can see: ones they own, plus
 * ones they are a member of. Replaces
 * `OR: [{ teamOwnerId: userId }, { members: { some: { userId } } }]`.
 *
 * Async because the member half needs a lookup first — a scalar array cannot be
 * joined in a single query the way the old relation could.
 */
async function visibleTeamsWhere(userId) {
  const ids = await memberTeamIds(userId);
  return { OR: [{ teamOwnerId: userId }, { id: { in: ids } }] };
}

/**
 * Add a user to a team inside a workspace. Creates the membership row if this is
 * their first team there, otherwise appends the id.
 *
 * @param {object} db  prisma or a transaction client
 */
async function addTeamToMember(
  db,
  { userId, workspaceId, teamId, role, appContext },
) {
  // A seat belongs to ONE app (owner decision, 2026-08-08), so the identity of a
  // membership is (person, workspace, app) — the same person can hold a Team
  // seat and a Pro seat in the same workspace, as two rows. Callers pass the app
  // the seat is being granted in: the purchased plan's app, or the app the
  // invite was sent from. `team` is the fallback so a caller that has not been
  // updated yet grants the Team app rather than silently minting a Pro seat.
  const ctx = appContext === "pro" ? "pro" : "team";
  const existing = await db.teamMember.findUnique({
    where: {
      userId_workspaceId_appContext: { userId, workspaceId, appContext: ctx },
    },
    select: { id: true, teamIds: true, role: true },
  });
  if (!existing) {
    return db.teamMember.create({
      data: {
        userId,
        workspaceId,
        appContext: ctx,
        teamIds: teamId ? [teamId] : [],
        role: role || "MEMBER",
      },
    });
  }
  const teamIds = teamId
    ? [...new Set([...(existing.teamIds || []), teamId])]
    : existing.teamIds;
  return db.teamMember.update({
    where: { id: existing.id },
    // Role only ever escalates here; a demotion is an explicit setRole call.
    data: { teamIds, ...(role && existing.role === "MEMBER" ? { role } : {}) },
  });
}

/**
 * Strip a team id from every membership that carries it. THE ROW SURVIVES — the
 * person stays in the workspace with one fewer label. This is what makes
 * "delete the group, keep the person" work.
 *
 * Must run in the same transaction as the team delete (no FK to do it for us).
 */
async function removeTeamFromMembers(db, teamId) {
  const rows = await db.teamMember.findMany({
    where: { teamIds: { has: teamId } },
    select: { id: true, teamIds: true },
  });
  for (const r of rows) {
    await db.teamMember.update({
      where: { id: r.id },
      data: { teamIds: (r.teamIds || []).filter((t) => t !== teamId) },
    });
  }
  return rows.length;
}

/**
 * Remove a person from ONE team. Deliberately does NOT delete the row — see
 * removeFromWorkspace for that.
 */
async function removeMemberFromTeam(db, { userId, teamId }) {
  const row = await db.teamMember.findFirst({
    where: { userId, teamIds: { has: teamId } },
    select: { id: true, teamIds: true },
  });
  if (!row) return null;
  return db.teamMember.update({
    where: { id: row.id },
    data: { teamIds: (row.teamIds || []).filter((t) => t !== teamId) },
  });
}

/**
 * Remove a person from a workspace entirely — the ONLY way to revoke access.
 * Deleting every team they were in does not do this, by design.
 */
async function removeFromWorkspace(db, { userId, workspaceId }) {
  return db.teamMember.deleteMany({ where: { userId, workspaceId } });
}

module.exports = {
  memberTeamIds,
  memberTeamIdsInWorkspace,
  isTeamMember,
  teamMemberRows,
  teamMemberCount,
  visibleTeamsWhere,
  addTeamToMember,
  removeTeamFromMembers,
  removeMemberFromTeam,
  removeFromWorkspace,
};
