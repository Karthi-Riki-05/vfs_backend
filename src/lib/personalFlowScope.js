const { prisma } = require("./prisma");

/**
 * Builds the Prisma `OR` clause that scopes flows to a user's PERSONAL
 * workspace: flows with no team (teamId=null) PLUS flows in any team the user
 * OWNS. A Pro user's own Pro team folds into their personal context (see
 * flow.service getAllFlows and DATA-LOSS-001), so its flows count toward the
 * personal flow-pack limit — but flows the user created inside a JOINED team
 * (owned by someone else) do NOT and are excluded.
 *
 * Background: Pro-app Phase B routed Pro personal flows into the owner's Pro
 * team (teamId=proTeamId). The flow-pack counters previously filtered on
 * `teamId: null` only, so they under-counted Pro flows (saw 0). This helper
 * gives every flow-pack site (pack status, picker list, picker confirm, expiry
 * cron) one consistent definition of "the user's personal flows".
 *
 * Usage: `{ ...otherFilters, OR: await personalFlowTeamOr(userId) }`, or nest
 * inside an `AND` when the query already has its own top-level `OR`.
 *
 * @param {string} userId
 * @returns {Promise<Array<object>>} OR-clause array for a Prisma `where`.
 */
async function personalFlowTeamOr(userId) {
  const ownedTeams = await prisma.team.findMany({
    where: { teamOwnerId: userId, deletedAt: null },
    select: { id: true },
  });
  const ownedTeamIds = (ownedTeams || []).map((t) => t.id);
  return ownedTeamIds.length
    ? [{ teamId: null }, { teamId: { in: ownedTeamIds } }]
    : [{ teamId: null }];
}

module.exports = { personalFlowTeamOr };
