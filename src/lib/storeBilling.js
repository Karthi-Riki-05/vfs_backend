"use strict";

const AppError = require("../utils/AppError");

/**
 * Store-owned (in-app purchase) subscriptions — the one place that answers
 * "did Stripe sell this, or did Google/Apple?".
 *
 * WHY THIS EXISTS (bug-091). services/subscription.service.js was written when
 * Stripe was the only way to pay: it reads `subscription.paymentId` and hands
 * it straight to `stripe.subscriptions.*`. Once Play/App Store purchases became
 * real, those same methods started sending ids like
 * `rc_GPA.3306-1147-5266-25620` to Stripe, which answers "No such
 * subscription" — surfaced to the customer as a raw Stripe 404 on every
 * billing control (change plan, cancel, reactivate). `provider` appeared ZERO
 * times in that file.
 *
 * The guard is not merely defensive. Google and Apple require that a
 * store-purchased subscription be managed in the store — we genuinely cannot
 * change seats or cancel it server-side, whatever we do to the Stripe call. So
 * the correct behaviour is to STOP and say where to go, not to try harder.
 *
 * The mirror-image guard already existed on the IAP side
 * (iapService._grantTeam refuses to clobber a live Stripe subscription); this
 * is the missing half of that pair.
 */

// Marks paymentId / flowAddonStripeSubId values owned by an IAP provider,
// keyed on the store's original transaction id so renewals and expirations of
// the same underlying subscription resolve to the same record.
// The `rc_` spelling is historical (it predates the RevenueCat removal) and is
// now simply "the store-owned id prefix" for Google and Apple alike. It is
// WRITTEN on every IAP grant — do not rename it: existing rows carry it, and
// isStoreOwned() reads it as the fallback signal below.
const RC_PREFIX = "rc_";

// Every non-Stripe entitlement source. Lifecycle events may only touch
// records owned by one of these — Stripe records are read-only to IAP.
// RevenueCat was removed 2026-08-14 (never used in production; direct store
// billing only). Any historical row still stamped provider="revenuecat" is
// still recognised as store-owned via the RC_PREFIX paymentId signal.
const IAP_PROVIDERS = ["google", "apple"];

const STORE_LABELS = {
  google: "Google Play",
  apple: "the App Store",
};

/**
 * Is this subscription owned by a mobile store rather than Stripe?
 *
 * Two independent signals, either sufficient:
 *   • `provider` — the column iapService stamps on grant.
 *   • an `rc_`-prefixed `paymentId` — covers rows written before `provider`
 *     was populated, and any path that sets the id without the column.
 * A Stripe subscription id is always `sub_…`, so neither signal can false-positive
 * on one.
 */
function isStoreOwned(subscription) {
  if (!subscription) return false;
  if (IAP_PROVIDERS.includes(subscription.provider)) return true;
  return (
    typeof subscription.paymentId === "string" &&
    subscription.paymentId.startsWith(RC_PREFIX)
  );
}

/** Human name of the owning store, for user-facing copy. */
function storeLabel(subscription) {
  return (
    STORE_LABELS[subscription?.provider] ||
    "the app store you purchased from"
  );
}

/**
 * Throw unless this subscription is Stripe's to modify. Call at the top of any
 * method that will reach `stripe.subscriptions.*` with `subscription.paymentId`.
 *
 * `action` completes the sentence "cannot <action> here" (e.g. "change your
 * plan"). 409 CONFLICT, not 403/404: the request is well-formed and the caller
 * is entitled — it just conflicts with where the subscription actually lives.
 */
function assertNotStoreOwned(subscription, action) {
  if (!isStoreOwned(subscription)) return;
  const where = storeLabel(subscription);
  throw new AppError(
    `This subscription is managed by ${where}, so it cannot be changed here. ` +
      `Open your subscription settings in ${where} to ${action}.`,
    409,
    "MANAGED_BY_STORE",
  );
}

/**
 * Prisma `where` fragment excluding store-owned rows. Mirrors isStoreOwned()
 * — keep the two in step.
 */
function notStoreOwnedWhere() {
  return {
    NOT: {
      OR: [
        { provider: { in: IAP_PROVIDERS } },
        { paymentId: { startsWith: RC_PREFIX } },
      ],
    },
  };
}

module.exports = {
  RC_PREFIX,
  IAP_PROVIDERS,
  isStoreOwned,
  storeLabel,
  assertNotStoreOwned,
  notStoreOwnedWhere,
};
