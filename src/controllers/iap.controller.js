"use strict";

const { timingSafeEqual } = require("crypto");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const iapService = require("../services/iap.service");
const googlePlayService = require("../services/googleplay.service");
const appleStoreService = require("../services/applestore.service");

/** Constant-time comparison of the RTDN shared token. */
function rtdnTokenValid(provided) {
  const expected = process.env.IAP_RTDN_TOKEN;
  if (!expected || expected.trim() === "") return false; // fail closed
  const a = Buffer.from(String(provided || ""));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

class IapController {
  /**
   * POST /api/v1/iap/validate  (authenticated)
   * Called by the web app right after the native purchase sheet succeeds.
   * Verifies the token/receipt with the store, then grants through the
   * shared entitlement engine. Safe to call repeatedly (dedup ledger).
   */
  validate = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const {
      store,
      productId,
      purchaseToken,
      packageName,
      receiptData,
      // The localized amount + currency the store showed the buyer (from the
      // client's iapPrices()). Google's server API does not return the price
      // for consumables, so this is the only source of the REAL amount charged
      // (e.g. ₹499 INR) — without it the grant falls back to the fixed USD list
      // price. Client-supplied, so treated as display metadata only: it sets
      // the recorded amount, never an entitlement.
      priceAmount,
      currency,
    } = req.body;

    const event =
      store === "google_play"
        ? await googlePlayService.validatePurchase({
            userId,
            packageName,
            productId,
            purchaseToken,
          })
        : await appleStoreService.validatePurchase({
            userId,
            productId,
            receiptData,
          });

    // Stamp the observed localized price onto the event so _amountCents records
    // the true amount + currency instead of the USD fallback. Guarded: only a
    // positive number is trusted; anything else leaves the fallback in place.
    if (event && typeof priceAmount === "number" && priceAmount > 0) {
      event.price = priceAmount;
      if (typeof currency === "string" && currency.trim()) {
        event.currency = currency.trim().toLowerCase();
      }
    }

    const provider = store === "google_play" ? "google" : "apple";
    const result = await iapService.handleIapEvent(event, provider);

    // A subscription already bound to a DIFFERENT app account must not report
    // success. Apple keys a subscription to the Apple ID, so a user who buys on
    // account A and later signs in as account B presents the same
    // originalTransactionId; granting it to B would be subscription sharing, so
    // the service refuses. Reporting `granted: true` there (the behaviour until
    // 2026-08-22) left the buyer on Free with no error shown anywhere.
    if (result.skipped === "owned_by_other_user") {
      return res.status(409).json({
        success: false,
        error: {
          code: "SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT",
          message:
            "This purchase is already linked to a different ValueCharts " +
            "account. Sign in with that account to use it, or contact " +
            "support to move the subscription.",
        },
        data: { validated: true, productId, granted: false },
      });
    }

    res.json({
      success: true,
      data: {
        validated: true,
        productId,
        // "duplicate" means an earlier delivery already granted TO THIS USER —
        // still OK. The cross-account case is handled above.
        granted: !!result.granted || result.skipped === "duplicate",
        detail: result,
      },
    });
  });

  /**
   * POST /api/v1/iap/google/rtdn?token=…  (Pub/Sub push, no user auth)
   * Google Real-Time Developer Notifications. Always answers 200 quickly on
   * processable messages so Pub/Sub does not retry-storm; a wrong/missing
   * shared token is the only rejection.
   */
  googleRtdn = asyncHandler(async (req, res) => {
    if (!rtdnTokenValid(req.query.token)) {
      logger.warn("[iap-google] RTDN push with invalid token rejected");
      return res.status(401).json({ success: false });
    }
    try {
      const event = await googlePlayService.normalizeRtdn(req.body);
      if (event) await iapService.handleIapEvent(event, "google");
    } catch (err) {
      // Log and ack anyway — the dedup ledger makes a manual replay safe,
      // and a 5xx would make Pub/Sub hammer the endpoint.
      logger.error(`[iap-google] RTDN processing failed: ${err.message}`);
    }
    res.status(200).json({ received: true });
  });

  /**
   * POST /api/v1/iap/apple/notifications  (App Store Server, no user auth)
   * Authenticity comes from the JWS signature chain pinned to Apple's root
   * CA — verified inside normalizeNotification.
   */
  appleNotifications = asyncHandler(async (req, res) => {
    try {
      const event = await appleStoreService.normalizeNotification(req.body);
      if (event) await iapService.handleIapEvent(event, "apple");
    } catch (err) {
      logger.error(`[iap-apple] notification processing failed: ${err.message}`);
      // Signature failures are 4xx-worthy; Apple retries on non-2xx, which
      // is what we want for transient errors but not for forgeries.
      if (String(err.code || "").startsWith("INVALID_JWS")) {
        return res.status(401).json({ success: false });
      }
    }
    res.status(200).json({ received: true });
  });
}

module.exports = new IapController();
