"use strict";

/**
 * IAP product catalog — single source of truth mapping store product IDs
 * (created in Google Play Console / App Store Connect, purchased directly
 * through Play Billing / StoreKit) onto ValueChart entitlements.
 *
 * RULES
 *  - Product IDs are PERMANENT in both stores. Never rename or reuse one;
 *    add a new ID and keep the old mapping for existing purchasers.
 *  - The same ID string must be created in BOTH stores so this catalog
 *    stays store-agnostic (one row per product, not per platform).
 *  - Play Billing base plans arrive as "productId:basePlanId" — resolve via
 *    resolveIapProduct(), never by direct map lookup.
 *
 * Entitlement types (dispatched in services/iap.service.js):
 *  - pro_lifetime : one-time Pro unlock (non-consumable)
 *  - flow_pack    : 30-day flow pack (consumable) — mirrors handleExtraFlowsWebhook
 *  - flow_addon   : monthly flow subscription — mirrors handleFlowAddonCheckoutWebhook
 *  - ai_credits   : credit top-up (consumable) — mirrors payment.service ai_addon_credits
 *  - team         : team seat subscription — mirrors _handleCheckoutComplete
 *  - noop         : recognised but intentionally no entitlement change
 */

// Seat tiers offered as fixed-price store products (stores cannot do
// per-seat quantity pricing like Stripe). Must stay in sync with the
// products actually created in Play Console / App Store Connect.
// Owner decision 2026-07-23: team plans cap at 25 members on ALL platforms
// (web + native). The 50/75/100 tiers were retired everywhere (previously
// they were web-only via Stripe). Do not add larger tiers without new store
// products AND an owner decision.
const TEAM_SEAT_TIERS = [5, 10, 15, 20, 25];

const IAP_PRODUCTS = {
  // ── Pro (one-time lifetime unlock) ─────────────────────────────────────
  pro_lifetime: { type: "pro_lifetime" },
  // Legacy product IDs from the original (RevenueCat-era) integration — kept
  // as plain string mappings so any historical purchase/restore still
  // resolves. Same entitlement. No vendor involved: the RevenueCat webhook
  // was removed 2026-08-14.
  valuechart_pro_monthly: { type: "pro_lifetime" },
  valuechart_pro_yearly: { type: "pro_lifetime" },
  valuechart_free: { type: "noop" },

  // ── Legacy iOS team subscriptions (old native app, live in App Store
  // Connect) ── Phase-1 pipeline testing + historical restores. No active
  // subscribers (owner-confirmed 2026-07-10); deactivate in the console once
  // the new team_* products exist. Mapped to the same team entitlements.
  "com.valuecharts.app.mon_5": { type: "team", seats: 5, period: "monthly" },
  "com.valuecharts.app.mon_10": { type: "team", seats: 10, period: "monthly" },
  "com.valuecharts.app.year_5": { type: "team", seats: 5, period: "yearly" },
  "com.valuecharts.app.year_10": { type: "team", seats: 10, period: "yearly" },

  // ── Legacy ANDROID team subscriptions (live in Play Console under
  // com.valuecharts.app) ── same Phase-1 purpose as the iOS set above.
  // mth_5/mth_10/yr_5/yr_10 confirmed 2026-07-16 from the live native
  // Android app's own Kotlin source (skuTeamMth5/Mth10/Yr5/Yr10) — mirrors
  // the iOS 4-tier pattern with Android's mth_/yr_ naming. The
  // mth_15/20/25 entries below round out the in-app 25-seat cap. Larger
  // legacy guesses (mth_30/35/40/100) were removed 2026-07-23 with the
  // 50/75/100 tier retirement — they exceeded the seat cap, were never
  // referenced by the shipped app, and had no active subscribers.
  "com.valuecharts.app.mth_5": { type: "team", seats: 5, period: "monthly" },
  "com.valuecharts.app.mth_10": { type: "team", seats: 10, period: "monthly" },
  "com.valuecharts.app.yr_5": { type: "team", seats: 5, period: "yearly" },
  "com.valuecharts.app.yr_10": { type: "team", seats: 10, period: "yearly" },
  "com.valuecharts.app.mth_15": { type: "team", seats: 15, period: "monthly" },
  "com.valuecharts.app.mth_20": { type: "team", seats: 20, period: "monthly" },
  "com.valuecharts.app.mth_25": { type: "team", seats: 25, period: "monthly" },

  // ── Flow packs (30-day consumables, Pro app) ───────────────────────────
  // flowPackage/flowCount mirror the Stripe checkout metadata consumed by
  // proService.handleExtraFlowsWebhook.
  flowpack_50: { type: "flow_pack", flowPackage: "50", flowCount: 50 },
  flowpack_unlimited: {
    type: "flow_pack",
    flowPackage: "unlimited",
    flowCount: 0,
  },

  // ── Flow add-on subscriptions (monthly, Pro app) ───────────────────────
  addon_flows_standard_monthly: { type: "flow_addon", plan: "standard_100" },
  addon_flows_unlimited_monthly: { type: "flow_addon", plan: "unlimited" },

  // ── Legacy Pro flow-addon subscriptions ── real products that can be
  // purchase-tested before the new addon_flows_* catalog exists.
  //   ltd   → limited flow allowance  → standard_100 entitlement
  //   unltd → unlimited flows         → unlimited entitlement
  //
  // ANDROID (live in Play Console under com.valuecharts.pro, basePlan p1m,
  // verified 2026-07-31 via the Play Developer API):
  "com.valuecharts.pro.ltd": { type: "flow_addon", plan: "standard_100" },
  "com.valuecharts.pro.unltd": { type: "flow_addon", plan: "unlimited" },
  // iOS (App Store Connect, subscription group "Value Charts Pro
  // Subscription", both Approved 2026-08-12) — Apple's product IDs carry a
  // `_flows` suffix that Android's do not; do not assume the two stores
  // share a string here.
  "com.valuecharts.pro.ltd_flows": { type: "flow_addon", plan: "standard_100" },
  "com.valuecharts.pro.unltd_flows": { type: "flow_addon", plan: "unlimited" },

  // ── AI credit packs (consumables, both apps) ───────────────────────────
  // TEAM app ids. Sold from the Team shell on both platforms.
  aicredits_50: { type: "ai_credits", credits: 50, packType: "starter" },
  aicredits_100: { type: "ai_credits", credits: 100, packType: "standard" },
  aicredits_200: { type: "ai_credits", credits: 200, packType: "proppack" },
  // PRO app ids — same three packs, same entitlements, different strings.
  // WHY the suffix (2026-08-19): Apple scopes a product id to the DEVELOPER
  // TEAM, not the app, so `aicredits_50` — already created under the Team app
  // — can never be reused by the Pro app ("already being used by another
  // in-app purchase associated with this team"). Play scopes per package and
  // would have allowed reuse, but using the same `_pro` string on BOTH stores
  // keeps the lookup keyed on variant alone instead of variant × platform.
  // Resolved client-side by aiCreditProductId() in frontend/lib/iapBridge.ts.
  aicredits_50_pro: { type: "ai_credits", credits: 50, packType: "starter" },
  aicredits_100_pro: { type: "ai_credits", credits: 100, packType: "standard" },
  aicredits_200_pro: { type: "ai_credits", credits: 200, packType: "proppack" },
};

// ── Team seat subscriptions (Team app) — generated matrix ────────────────
// team_5_monthly … team_25_yearly. seats/period mirror the Stripe checkout
// metadata consumed by subscriptionService._handleCheckoutComplete.
for (const seats of TEAM_SEAT_TIERS) {
  for (const period of ["monthly", "yearly"]) {
    IAP_PRODUCTS[`team_${seats}_${period}`] = {
      type: "team",
      seats,
      period,
    };
  }
}

/**
 * Resolve a store product ID to its catalog entry.
 * Handles the Play Billing "productId:basePlanId" form. Returns null for
 * unknown products (callers must log and skip — never guess entitlements).
 */
function resolveIapProduct(productId) {
  if (!productId || typeof productId !== "string") return null;
  const key = productId.split(":")[0];
  const entry = IAP_PRODUCTS[key];
  return entry ? { productKey: key, ...entry } : null;
}

module.exports = { IAP_PRODUCTS, TEAM_SEAT_TIERS, resolveIapProduct };
