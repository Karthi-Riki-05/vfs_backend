const { prisma } = require("./prisma");
const logger = require("../utils/logger");

/**
 * On team-subscription expiry, a user reverts to the 50-flow team limit.
 * If they hold more than 50 team flows (appContext='team', teamId=null), the
 * excess (oldest by updatedAt) is marked for downgrade and the user enters the
 * team-picker phase so they can choose which 50 to keep. With <=50 flows there
 * is nothing at risk — just drop the unlimited flag.
 */
async function applyTeamFlowPicker(userId) {
  const TEAM_FLOW_LIMIT = 50;
  const teamFlows = await prisma.flow.findMany({
    where: {
      ownerId: userId,
      appContext: "team",
      teamId: null,
      deletedAt: null,
    },
    select: { id: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  if (teamFlows.length > TEAM_FLOW_LIMIT) {
    const excessIds = teamFlows.slice(TEAM_FLOW_LIMIT).map((f) => f.id);
    await prisma.flow.updateMany({
      where: { id: { in: excessIds } },
      data: { markedForDowngrade: true },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { isInTeamPickerPhase: true },
    });
    logger.info(
      `[downgradeUser] ${userId}: ${excessIds.length} team flows marked for downgrade, team-picker phase started`,
    );
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: { teamUnlimitedFlows: false },
    });
  }
}

/**
 * Downgrades a user when their Team subscription expires or is cancelled.
 *
 * Behaviour:
 *  - User has a Pro lifetime purchase (proPurchasedAt IS NOT NULL):
 *      • Keeps hasPro = true, proPurchasedAt unchanged
 *      • Sets currentVersion = 'pro' (returns to Pro workspace)
 *      • Leaves proFlowLimit / proUnlimitedFlows / proAdditionalFlowsPurchased alone
 *      • Zeros ONLY the team-scoped plan credits (appContext = 'team')
 *      • Addon credits NEVER expire — preserved on every row
 *      • Pro credits (appContext = 'pro') are untouched
 *
 *  - User has NO Pro purchase (proPurchasedAt IS NULL):
 *      • Sets hasPro = false, currentVersion = 'free'
 *      • Resets proFlowLimit = 10, proUnlimitedFlows = false
 *      • Zeros lapsed plan credits on team/pro rows (addon credits preserved)
 *      • Ensures a one-time Free balance row exists (20 credits, no refill)
 *
 * @param {string} userId
 * @param {{ reason?: string }} [options]
 */
async function downgradeUser(userId, options = {}) {
  const reason = options.reason || "team_expiry";
  if (!userId) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      hasPro: true,
      proPurchasedAt: true,
      currentVersion: true,
    },
  });

  if (!user) return;

  // ── Case 1: user holds a lifetime Pro purchase ──────────────────────────
  // Team subscription expiry must NOT revoke the separately-purchased Pro.
  // Only strip team-scoped access; leave everything else intact.
  if (user.proPurchasedAt) {
    await prisma.user.update({
      where: { id: userId },
      data: { currentVersion: "pro" },
      // hasPro, proPurchasedAt, proFlowLimit, proUnlimitedFlows unchanged
    });

    // Zero team plan credits only. Addon credits are purchased and NEVER
    // expire, so they survive the downgrade. Pro credits (appContext='pro')
    // are untouched.
    await prisma.aiCreditBalance.updateMany({
      where: { userId, appContext: "team" },
      data: { planCredits: 0 },
    });

    // Team access revoked → revert to 50-flow team limit, picker if over.
    await applyTeamFlowPicker(userId);

    logger.info(
      `[downgradeUser] ${userId}: team access removed, Pro preserved (${reason})`,
    );
    return;
  }

  // ── Case 2: user only had a Team subscription (no Pro purchase) ──────────
  // Full downgrade — revert everything to free tier.
  if (!user.hasPro && user.currentVersion === "free") {
    // Already at free — nothing to do.
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      hasPro: false,
      currentVersion: "free",
      proUnlimitedFlows: false,
      proFlowLimit: 10,
      teamFlowLimit: 50,
      teamUnlimitedFlows: false,
    },
  });

  // Zero out the lapsed plan credits on team/pro rows. Addon credits are
  // purchased and NEVER expire — they are intentionally left untouched.
  await prisma.aiCreditBalance.updateMany({
    where: { userId, appContext: { in: ["team", "pro"] } },
    data: { planCredits: 0 },
  });

  // Ensure the Free balance row exists (one-time 20-credit grant, no expiry).
  // If it already exists, keep whatever credits the user currently holds —
  // free credits are a one-time grant and must never be topped back up.
  await prisma.aiCreditBalance.upsert({
    where: { userId_appContext: { userId, appContext: "free" } },
    update: {},
    create: {
      userId,
      appContext: "free",
      planCredits: 20,
      addonCredits: 0,
      planResetsAt: null,
    },
  });

  // Team access revoked → revert to 50-flow team limit, picker if over.
  await applyTeamFlowPicker(userId);

  logger.info(
    `[downgradeUser] ${userId}: fully downgraded to free (${reason})`,
  );
}

module.exports = downgradeUser;
