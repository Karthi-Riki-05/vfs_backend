/**
 * The Prisma `OR` clause scoping flows to a user's PERSONAL workspace.
 *
 * Under the owner-as-workspace model (2026-08-07) that is simply "flows whose
 * workspace is this user" — `workspace_id` holds a user id, and a user's own id
 * IS their personal workspace. The previous version had to union
 * `teamId: null` with every team the user OWNED, because personal content was
 * stored as a null team and a Pro user's flows lived under their Pro team.
 * Neither case exists any more.
 *
 * Kept as a function (rather than inlined) so every flow-pack site — pack
 * status, picker list, picker confirm, expiry cron — keeps sharing ONE
 * definition of "the user's personal flows".
 *
 * Usage: `{ ...otherFilters, OR: await personalFlowTeamOr(userId) }`, or nest
 * inside an `AND` when the query already has its own top-level `OR`.
 *
 * @param {string} userId
 * @returns {Promise<Array<object>>} OR-clause array for a Prisma `where`.
 */
async function personalFlowTeamOr(userId) {
  return [{ workspaceId: userId }];
}

module.exports = { personalFlowTeamOr };
