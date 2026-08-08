"use strict";

/**
 * Product pricing — single source of truth for the list price of every
 * ValueChart product, in the unit each consumer already expects.
 *
 * These values were previously module-local constants in
 * services/subscription.service.js (team seats) and services/pro.service.js
 * (Pro, flow packs, flow add-ons). They moved here because a second consumer
 * appeared: services/iap.service.js needs the list price to record a purchase
 * amount when a mobile store does not report the charged amount (every Google
 * Play path currently arrives without one — see iapService._amountCents for the
 * four possible sources and which are still unwired). Duplicating the numbers
 * in a second file would guarantee they drift.
 *
 * IMPORTANT — these are OUR list prices (what Stripe charges on the web), not
 * necessarily what a store charged. Play Console / App Store Connect hold
 * their own per-country price points and Google/Apple take their cut, so for
 * an in-app purchase these figures are the best local ESTIMATE of the charge,
 * not the receipt. Never present a store-derived figure as the authoritative
 * amount charged; the store's own receipt is authoritative.
 */

// Team seat subscriptions — cents per user, per period.
const TEAM_PRICING = {
  monthly: { perUser: 200 }, // $2.00/user/month
  yearly: { perUser: 2000 }, // $20.00/user/year
};

// One-time Pro unlock — cents.
const PRO_LIFETIME_PRICE_CENTS = 500; // $5.00 one-time

// 30-day flow packs (one-time) — cents, keyed by flowPackage.
// The `50` key is written as a numeric literal for historical reasons but is
// looked up with the STRING "50" (iapProducts flowPackage, and the "50" |
// "unlimited" argument to createFlowPurchaseCheckout). That works because JS
// object keys are always strings — it is load-bearing, not a coincidence, so
// do not "tidy" either side into a number.
const FLOW_PRICING = {
  50: 1000, // $10.00 — Standard (100 flows)
  unlimited: 2000, // $20.00 — Unlimited
};

// Monthly flow add-on subscriptions — whole USD units, keyed by plan.
const FLOW_ADDON_PLAN_PRICE_USD = {
  standard_100: 10,
  unlimited: 20,
};

module.exports = {
  TEAM_PRICING,
  PRO_LIFETIME_PRICE_CENTS,
  FLOW_PRICING,
  FLOW_ADDON_PLAN_PRICE_USD,
};
