/**
 * Single home for "what plan does this user actually OWN?".
 *
 * bug-086: three surfaces each answered this question their own way and
 * disagreed — `GET /users/team-context` promoted any team OWNER to
 * `currentVersion:'team'` with no subscription check, `getMyContexts` read the
 * team's `appContext` column (a workspace label, not a receipt), and
 * `requireTeamChatEntitlement` accepted the mere existence of a membership row.
 * A free user who owned an unpaid team therefore saw a purple "Team Plan"
 * badge, an unlocked Chat/Teams sidebar and a 200 from every chat route, while
 * `/subscription/status` on the same page load said "Free Plan".
 *
 * The rule, in one place:
 *   plan is derived from a LIVE subscription, or a genuine Pro purchase.
 *   Owning a team, and `users.current_version`, are WORKSPACE CONTEXT — they
 *   are never evidence of payment. (Same doctrine as utils/userTier.js, which
 *   deliberately does not read currentVersion.)
 *
 * Related: docs/xc-security.md (server is authoritative),
 * utils/userTier.js (AI-provider routing tier).
 */

/** Fields any caller must select to use this module against a user. */
const OWNER_PLAN_SELECT = {
  hasPro: true,
  proPurchasedAt: true,
  isLegacyPro: true,
  subscription: {
    select: {
      productType: true,
      status: true,
      expiresAt: true,
      deletedAt: true,
    },
  },
};

/**
 * Both conditions are load-bearing: status AND the paid period.
 *
 * A subscription row can keep status='active' after it has actually lapsed, so
 * status alone is not proof of a live plan. Status moves via a store/Stripe
 * webhook, an admin action, or the daily 08:00 UTC `expireLapsedSubscriptions`
 * sweep registered in index.js — but a webhook can be missed and the sweep runs
 * at most once a day, so between lapse and sweep the row still reads 'active'.
 * Hence the expiresAt check.
 * (An earlier version of this comment claimed no such cron existed. It does —
 * corrected 2026-08-20 — but that does not make the date check redundant.)
 *
 * The date check is NOT sufficient on its own either, which the same day
 * demonstrated: a cancelled Play subscription had expiresAt a month in the
 * FUTURE (Google expires test subscriptions in ~5 minutes while we record the
 * nominal period), so a date-only test would have kept granting a 5-seat team
 * plan for a month. The status check caught it. Keep both, in this order.
 *
 * 'cancelling' = cancel_at_period_end set — access legitimately runs to
 * expiresAt (see bug-033).
 */
function isSubscriptionLive(sub) {
  if (!sub || sub.deletedAt) return false;
  if (!["active", "cancelling"].includes(sub.status)) return false;
  return !sub.expiresAt || new Date(sub.expiresAt) > new Date();
}

/** 'team' | 'pro' | null — the plan a live subscription grants. */
function planFromSubscription(sub) {
  if (!isSubscriptionLive(sub)) return null;
  const pt = String(sub.productType || "").toLowerCase();
  if (pt.startsWith("team")) return "team";
  if (pt.startsWith("pro")) return "pro";
  return null;
}

/**
 * Pro lifetime ($1). `hasPro` alone is not enough — it can be flipped by team
 * grants (see utils/userTier.js), so require proof of an actual purchase.
 * `isLegacyPro` covers users migrated in before proPurchasedAt existed.
 */
function hasProPurchase(user) {
  return !!(user?.hasPro && (user.proPurchasedAt || user.isLegacyPro));
}

/**
 * The plan a user owns, from a user object selected with OWNER_PLAN_SELECT.
 * @returns {'free'|'pro'|'team'}
 */
function resolveOwnedPlan(user) {
  return (
    planFromSubscription(user?.subscription) ||
    (hasProPurchase(user) ? "pro" : "free")
  );
}

/**
 * The same rule as resolveOwnedPlan(), expressed as a Prisma `where` on a USER
 * so callers can ask "is this owner paid?" inside a single query instead of
 * loading every row and filtering in JS. Kept here so the two forms cannot
 * drift apart. Must be CALLED (not a constant) — it stamps `new Date()`.
 */
function paidOwnerWhere() {
  return {
    OR: [
      {
        subscription: {
          deletedAt: null,
          status: { in: ["active", "cancelling"] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      },
      { hasPro: true, proPurchasedAt: { not: null } },
      { hasPro: true, isLegacyPro: true },
    ],
  };
}

module.exports = {
  OWNER_PLAN_SELECT,
  paidOwnerWhere,
  isSubscriptionLive,
  planFromSubscription,
  hasProPurchase,
  resolveOwnedPlan,
};
