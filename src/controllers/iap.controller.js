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
    const { store, productId, purchaseToken, packageName, receiptData } =
      req.body;

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

    const provider = store === "google_play" ? "google" : "apple";
    const result = await iapService.handleIapEvent(event, provider);

    res.json({
      success: true,
      data: {
        validated: true,
        productId,
        // "duplicate" means an earlier delivery already granted — still OK.
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
