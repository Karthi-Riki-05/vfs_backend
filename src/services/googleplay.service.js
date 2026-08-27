"use strict";

/**
 * Google Play Billing — server-side validation and lifecycle tracking
 * (direct integration; no third-party billing vendor).
 *
 * Two entry points, both normalizing Google payloads into the ONE internal
 * event shape consumed by iap.service.handleIapEvent():
 *   - validatePurchase()  — called (authenticated) right after the app's
 *     purchase stream reports success; verifies the purchaseToken with the
 *     Play Developer API, checks the token belongs to the calling user, and
 *     acknowledges (unacknowledged purchases AUTO-REFUND after ~3 days).
 *   - normalizeRtdn()     — decodes a Pub/Sub push (Real-Time Developer
 *     Notifications), re-fetches the authoritative state from Google, and
 *     maps notification types to internal lifecycle events.
 *
 * Config (backend .env — the service-account key NEVER leaves this backend):
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON  — full JSON key as one line (preferred)
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_PATH  — or a path to the key file
 *   IAP_RTDN_TOKEN                    — shared token the Pub/Sub push URL must
 *                                       carry (?token=...) to be accepted
 */

const fs = require("fs");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const { resolveIapProduct } = require("../config/iapProducts");

// RTDN subscriptionNotification.notificationType → internal event type.
// https://developer.android.com/google/play/billing/rtdn-reference
const SUBSCRIPTION_RTDN_MAP = {
  1: "RENEWAL", // SUBSCRIPTION_RECOVERED (back from account hold)
  2: "RENEWAL", // SUBSCRIPTION_RENEWED
  3: "CANCELLATION", // SUBSCRIPTION_CANCELED (auto-renew off; active till expiry)
  4: "INITIAL_PURCHASE", // SUBSCRIPTION_PURCHASED
  5: "BILLING_ISSUE", // SUBSCRIPTION_ON_HOLD
  6: "BILLING_ISSUE", // SUBSCRIPTION_IN_GRACE_PERIOD
  7: "UNCANCELLATION", // SUBSCRIPTION_RESTARTED
  // 10 SUBSCRIPTION_PAUSED: access is suspended until resume — closest safe
  // mapping is cancellation (entitlement continues until period end).
  10: "CANCELLATION",
  12: "EXPIRATION", // SUBSCRIPTION_REVOKED (refunded — immediate)
  13: "EXPIRATION", // SUBSCRIPTION_EXPIRED
};

let _publisher = null;

/** Lazily builds the authenticated Android Publisher client (singleton).
 * googleapis is required HERE, not at module top — it is a very large
 * library and loading it eagerly would bloat every process (and test
 * worker) that merely requires the route tree. */
function getPublisher() {
  if (_publisher) return _publisher;
  // eslint-disable-next-line global-require
  const { google } = require("googleapis");
  const inline = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  const path = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH;
  let credentials;
  if (inline && inline.trim() !== "") {
    credentials = JSON.parse(inline);
  } else if (path && fs.existsSync(path)) {
    credentials = JSON.parse(fs.readFileSync(path, "utf8"));
  } else {
    throw new AppError(
      "Google Play billing is not configured on the server",
      503,
      "IAP_NOT_CONFIGURED",
    );
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  _publisher = google.androidpublisher({ version: "v3", auth });
  return _publisher;
}

/** Renewal orderIds are `GPA.xxxx..0`, `..1`, … — strip the suffix so every
 * renewal of one subscription shares a stable original id. */
/**
 * The recurring price Play reports for a subscription line item, as
 * { price, currency } — or nulls when Play doesn't give one.
 *
 * WHY (bug-131): the two call sites below used to hardcode `price: null` with
 * the comment "subscriptionsv2 does not expose the charged amount". That was
 * wrong — `lineItems[].autoRenewingPlan.recurringPrice` is a Money
 * ({ currencyCode, units, nanos }) and has been in the v3 API all along.
 *
 * The consequence was user-visible: with no price on the event,
 * iapService._amountCents() fell back to OUR list price, so every renewal in
 * the Billing "Transactions" list recorded $10.00 for a plan Google actually
 * charged $9.99 for — and in a country whose Play tier isn't a straight
 * conversion, the gap is far wider than a cent.
 *
 * Caveat carried from Google's own docs: recurringPrice excludes tax and
 * discounts. It is much closer than a list-price guess, but the store receipt
 * remains the authority on the exact amount debited.
 */
function recurringPriceOf(line) {
  const money = line?.autoRenewingPlan?.recurringPrice;
  if (!money) return { price: null, currency: null };
  const units = Number(money.units || 0);
  const nanos = Number(money.nanos || 0);
  if (!Number.isFinite(units) || !Number.isFinite(nanos)) {
    return { price: null, currency: null };
  }
  return {
    price: units + nanos / 1e9,
    currency: money.currencyCode ? String(money.currencyCode).toLowerCase() : null,
  };
}

function baseOrderId(orderId) {
  return orderId ? orderId.replace(/\.\.\d+$/, "") : orderId;
}

/**
 * The dedup key for a Play event. MUST be derived from the PURCHASE, never
 * from the delivery, because the same purchase reaches us through two
 * independent channels:
 *
 *   1. the app's authenticated POST /iap/validate   → id `gp:<orderId>`
 *   2. Google's RTDN push                           → previously `gp-rtdn:<messageId>`
 *
 * A Pub/Sub messageId is unique per DELIVERY, so those two never collided and
 * both granted. Observed live 2026-08-20: RTDN landed 270ms before the client
 * call and the user got TWO teams (`test4321's Team` ×2, created 1ms apart),
 * plus a 409 when the second `teamMember.create` hit its unique constraint.
 * Pub/Sub is also at-least-once, so a mere REDELIVERY of one notification used
 * to re-grant as well.
 *
 * Keying on the order id fixes both: the two channels now produce the same
 * string for the same purchase, and a redelivery is recognised as a duplicate.
 *
 * The event type is included for every event EXCEPT the initial purchase —
 * that omission is deliberate and load-bearing. The client calls the purchase
 * `INITIAL_PURCHASE` while RTDN calls it `SUBSCRIBED`/type 4, so including the
 * type would make them differ again. Lifecycle events DO need it, or a
 * CANCELLATION would be swallowed as a duplicate of the purchase it follows
 * (a renewal already differs naturally — Google issues `GPA.xxx..1`).
 */
function playEventId(type, orderId, purchaseToken) {
  const ref =
    orderId || (purchaseToken ? purchaseToken.slice(0, 24) : "unknown");
  return type === "INITIAL_PURCHASE" || type === "NON_RENEWING_PURCHASE"
    ? `gp:${ref}`
    : `gp:${type}:${ref}`;
}

function isSubscriptionProduct(productId) {
  const product = resolveIapProduct(productId);
  return (
    !!product && (product.type === "team" || product.type === "flow_addon")
  );
}

/**
 * Verifies a purchase token with Google and returns the normalized internal
 * event. Throws AppError on any token that is not genuinely purchased or
 * that belongs to a different user (replay protection).
 */
async function validatePurchase({
  userId,
  packageName,
  productId,
  purchaseToken,
}) {
  if (!packageName || !productId || !purchaseToken) {
    throw new AppError("Missing purchase fields", 400, "INVALID_PURCHASE");
  }
  const publisher = getPublisher();

  if (isSubscriptionProduct(productId)) {
    const { data: sub } = await publisher.purchases.subscriptionsv2.get({
      packageName,
      token: purchaseToken,
    });

    const state = sub.subscriptionState;
    const okStates = [
      "SUBSCRIPTION_STATE_ACTIVE",
      "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
    ];
    if (!okStates.includes(state)) {
      throw new AppError(
        `Subscription not active (${state})`,
        400,
        "PURCHASE_NOT_ACTIVE",
      );
    }

    // Replay protection: the token must carry the account id the app stamped
    // at purchase time (obfuscatedAccountId = ValueChart user id), and it
    // must match the AUTHENTICATED caller.
    const tokenAccount =
      sub.externalAccountIdentifiers?.obfuscatedExternalAccountId || null;
    if (tokenAccount && tokenAccount !== userId) {
      throw new AppError(
        "Purchase belongs to a different account",
        403,
        "PURCHASE_ACCOUNT_MISMATCH",
      );
    }

    const line = (sub.lineItems || [])[0] || {};
    const lineProductId = line.productId || productId;
    const expiryMs = line.expiryTime ? Date.parse(line.expiryTime) : null;
    const orderId = sub.latestOrderId || null;

    // Acknowledge (v1 API — v2 has no acknowledge). Idempotent-ish: Google
    // errors if already acknowledged, which we swallow.
    if (sub.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
      try {
        await publisher.purchases.subscriptions.acknowledge({
          packageName,
          subscriptionId: lineProductId,
          token: purchaseToken,
          requestBody: {},
        });
      } catch (err) {
        logger.warn(
          `[iap-google] subscription acknowledge failed (may already be acked): ${err.message}`,
        );
      }
    }

    return {
      id: playEventId("INITIAL_PURCHASE", orderId, purchaseToken),
      type: "INITIAL_PURCHASE",
      app_user_id: userId,
      product_id: lineProductId,
      transaction_id: orderId,
      original_transaction_id: baseOrderId(orderId),
      ...recurringPriceOf(line),
      store: "PLAY_STORE",
      expiration_at_ms: expiryMs,
    };
  }

  // One-time product (pro_lifetime, flow packs, AI credits)
  const { data: p } = await publisher.purchases.products.get({
    packageName,
    productId,
    token: purchaseToken,
  });

  // purchaseState: 0 purchased, 1 canceled, 2 pending
  if (p.purchaseState !== 0) {
    throw new AppError(
      `Purchase not completed (state ${p.purchaseState})`,
      400,
      "PURCHASE_NOT_COMPLETED",
    );
  }
  const tokenAccount = p.obfuscatedExternalAccountId || null;
  if (tokenAccount && tokenAccount !== userId) {
    throw new AppError(
      "Purchase belongs to a different account",
      403,
      "PURCHASE_ACCOUNT_MISMATCH",
    );
  }

  // Acknowledge one-time products too (same 3-day auto-refund rule). The
  // app's completePurchase() usually did this already — errors are benign.
  if (p.acknowledgementState === 0) {
    try {
      await publisher.purchases.products.acknowledge({
        packageName,
        productId,
        token: purchaseToken,
        requestBody: {},
      });
    } catch (err) {
      logger.warn(
        `[iap-google] product acknowledge failed (may already be acked): ${err.message}`,
      );
    }
  }

  return {
    id: playEventId("NON_RENEWING_PURCHASE", p.orderId, purchaseToken),
    type: "NON_RENEWING_PURCHASE",
    app_user_id: userId,
    product_id: productId,
    transaction_id: p.orderId || null,
    original_transaction_id: p.orderId || null,
    price: null, // products.get does not expose the charged amount
    currency: null,
    store: "PLAY_STORE",
    expiration_at_ms: null,
  };
}

/**
 * Decodes a Pub/Sub push body and returns the normalized internal event, or
 * null for messages that need no action (test notifications, unmapped types).
 * The user is resolved from the obfuscated account id Google echoes back —
 * the id the app stamped at purchase time.
 */
async function normalizeRtdn(pushBody) {
  const encoded = pushBody?.message?.data;
  if (!encoded) return null;
  const messageId = pushBody.message.messageId || null;

  let notification;
  try {
    notification = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    logger.warn("[iap-google] RTDN message is not valid base64 JSON — ignored");
    return null;
  }

  // The delivery id is no longer part of the dedup key (see playEventId), but
  // it is still worth logging: Pub/Sub is at-least-once, so seeing the SAME
  // messageId twice means a redelivery, whereas two different messageIds
  // resolving to one event id means the client and RTDN raced — which is the
  // case this file's dedup now collapses.
  logger.info(`[iap-google] RTDN received (pubsub messageId=${messageId})`);

  if (notification.testNotification) {
    logger.info("[iap-google] RTDN test notification received");
    return null;
  }

  const packageName = notification.packageName;
  const publisher = getPublisher();

  // ── Subscription lifecycle ────────────────────────────────────────────
  const subNote = notification.subscriptionNotification;
  if (subNote) {
    const type = SUBSCRIPTION_RTDN_MAP[subNote.notificationType];
    if (!type) {
      logger.info(
        `[iap-google] RTDN subscription type ${subNote.notificationType} — no action`,
      );
      return null;
    }

    // Re-fetch the authoritative state (never trust the notification alone).
    const { data: sub } = await publisher.purchases.subscriptionsv2.get({
      packageName,
      token: subNote.purchaseToken,
    });
    const userId =
      sub.externalAccountIdentifiers?.obfuscatedExternalAccountId || null;
    if (!userId) {
      logger.error(
        `[iap-google] RTDN for token without obfuscated account id (type ${subNote.notificationType}) — cannot attribute, manual review needed`,
      );
      return null;
    }
    const line = (sub.lineItems || [])[0] || {};
    const orderId = sub.latestOrderId || null;

    return {
      id: playEventId(type, orderId, subNote.purchaseToken),
      type,
      app_user_id: userId,
      product_id: line.productId || subNote.subscriptionId,
      transaction_id: orderId,
      original_transaction_id: baseOrderId(orderId),
      ...recurringPriceOf(line),
      store: "PLAY_STORE",
      expiration_at_ms: line.expiryTime ? Date.parse(line.expiryTime) : null,
    };
  }

  // ── One-time products ─────────────────────────────────────────────────
  const oneTime = notification.oneTimeProductNotification;
  if (oneTime) {
    // Type 1 = purchased (the authenticated validate call is the primary
    // grant path; this is a safety net). Type 2 = canceled/pending-expired.
    if (oneTime.notificationType !== 1) return null;
    const { data: p } = await publisher.purchases.products.get({
      packageName,
      productId: oneTime.sku,
      token: oneTime.purchaseToken,
    });
    if (p.purchaseState !== 0) return null;
    const userId = p.obfuscatedExternalAccountId || null;
    if (!userId) {
      logger.error(
        `[iap-google] RTDN one-time purchase without obfuscated account id (sku ${oneTime.sku}) — cannot attribute, manual review needed`,
      );
      return null;
    }
    return {
      id: playEventId(
        "NON_RENEWING_PURCHASE",
        p.orderId,
        oneTime.purchaseToken,
      ),
      type: "NON_RENEWING_PURCHASE",
      app_user_id: userId,
      product_id: oneTime.sku,
      transaction_id: p.orderId || null,
      original_transaction_id: p.orderId || null,
      price: null,
      currency: null,
      store: "PLAY_STORE",
      expiration_at_ms: null,
    };
  }

  return null;
}

module.exports = {
  validatePurchase,
  normalizeRtdn,
  isSubscriptionProduct,
  // exported for tests
  baseOrderId,
};
