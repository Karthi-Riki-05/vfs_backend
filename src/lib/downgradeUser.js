const { prisma } = require("./prisma");
const logger = require("../utils/logger");

/**
 * Downgrades a user when their Team subscription expires or is cancelled.
 *
 * Behaviour:
 *  - User has a Pro lifetime purchase (proPurchasedAt IS NOT NULL):
 *      • Keeps hasPro = true, proPurchasedAt unchanged
 *      • Sets currentVersion = 'pro' (returns to Pro workspace)
 *      • Leaves proFlowLimit / proUnlimitedFlows / proAdditionalFlowsPurchased alone
 *      • Zeros ONLY the team-scoped AI credit balance (appContext = 'team')
 *      • Pro credits (appContext = 'pro') are untouched
 *
 *  - User has NO Pro purchase (proPurchasedAt IS NULL):
 *      • Sets hasPro = false, currentVersion = 'free'
 *      • Resets proFlowLimit = 10, proUnlimitedFlows = false
 *      • Resets ALL AI credit balances to free-tier (planCredits = 20)
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

    // Zero team-scoped AI credits. Pro credits (appContext='pro') are untouched.
    await prisma.aiCreditBalance.updateMany({
      where: { userId, appContext: "team" },
      data: { planCredits: 0, addonCredits: 0 },
    });

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
    },
  });

  // Reset ALL credit balances to free-tier allowance.
  await prisma.aiCreditBalance.updateMany({
    where: { userId },
    data: { planCredits: 20 },
  });

  logger.info(
    `[downgradeUser] ${userId}: fully downgraded to free (${reason})`,
  );
}

module.exports = downgradeUser;
