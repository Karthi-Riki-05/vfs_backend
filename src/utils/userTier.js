/**
 * AI tier resolution for ValueCharts.
 *
 * Tier is based on what the user OWNS, not which workspace
 * context they are currently viewing. `currentVersion` reflects
 * the active workspace and changes when a user toggles between
 * their personal / pro / team workspaces — it must NOT gate
 * access to AI features the user has already paid for.
 *
 * Routing:
 *   'team' → has active Team subscription   → Claude (diagram gen)
 *   'pro'  → has Pro lifetime ($1) purchase → Claude (diagram gen)
 *   'free' → neither of the above           → Gemini (diagram gen)
 *
 * Chat is always Gemini regardless of tier.
 */

const { prisma } = require("../lib/prisma");

/**
 * Pure tier check from a fully-loaded user object.
 * Requires hasPro + proPurchasedAt + subscription.status.
 */
function getUserAiTier(user) {
  if (!user) return "free";

  // Active Team subscription — checked by ownership
  // (subscription.status), independent of currentVersion.
  const hasActiveTeamSub = user.subscription?.status === "active";

  if (hasActiveTeamSub) return "team";

  // Pro lifetime — `hasPro` alone can be flipped by team grants,
  // so also require `proPurchasedAt` as proof of an actual
  // $1 purchase. Independent of currentVersion.
  const hasProPurchase =
    user.hasPro === true &&
    user.proPurchasedAt !== null &&
    user.proPurchasedAt !== undefined;

  if (hasProPurchase) return "pro";

  return "free";
}

/**
 * Async tier lookup by userId. Fetches the minimal fields
 * needed (hasPro, proPurchasedAt, subscription.status).
 * Returns 'free' on any DB failure (never throws).
 *
 * Note: currentVersion is intentionally NOT fetched — it is
 * workspace context, not ownership.
 */
async function getTierByUserId(userId) {
  if (!userId) return "free";

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        hasPro: true,
        proPurchasedAt: true,
        subscription: {
          select: { status: true },
        },
      },
    });

    if (!user) return "free";
    return getUserAiTier(user);
  } catch (err) {
    console.error("[userTier] DB lookup failed:", err.message);
    return "free";
  }
}

function usesClaude(user) {
  const tier = getUserAiTier(user);
  return tier === "team" || tier === "pro";
}

module.exports = {
  getUserAiTier,
  getTierByUserId,
  usesClaude,
};
