"use strict";

const { timingSafeEqual } = require("crypto");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const iapService = require("../services/iap.service");

/**
 * RevenueCat webhook — the single entry point for ALL mobile in-app
 * purchases (Pro lifetime, flow packs, flow add-ons, AI credits, team seat
 * plans). Product → entitlement mapping lives in config/iapProducts.js;
 * event processing (dedup, grants, lifecycle) in services/iap.service.js.
 */
class RevenueCatController {
  handleWebhook = asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;

    // FIX 1 (BUG-013): fail closed. If the secret is unset, the old code
    // compared against the literal string "Bearer undefined", so an attacker
    // sending `Authorization: Bearer undefined` would pass. Never accept when
    // unconfigured.
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (!secret || secret.trim() === "") {
      logger.error("REVENUECAT_WEBHOOK_SECRET is not set");
      return res.status(503).json({
        success: false,
        error: { code: "CONFIG_ERROR", message: "Webhook not configured" },
      });
    }

    // FIX 2 (BUG-013): constant-time comparison to avoid leaking the secret
    // via response timing. Length check first because timingSafeEqual throws
    // on length mismatch.
    const expected = Buffer.from("Bearer " + secret);
    const actual = Buffer.from(authHeader || "");
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Invalid webhook secret" },
      });
    }

    // Body may be a Buffer (express.raw) or already parsed object
    let body;
    try {
      body = Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString())
        : req.body;
    } catch {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_BODY",
          message: "Could not parse request body",
        },
      });
    }

    const event = body.event || {};
    logger.info(
      `[revenuecat] event type=${event.type} user=${event.app_user_id} product=${event.product_id}`,
    );

    try {
      await iapService.handleRevenueCatEvent(event);
    } catch (err) {
      // Respond 200 to prevent RevenueCat retry loops for transient DB
      // errors — the IapTransaction dedup ledger makes a manual replay safe.
      logger.error(`[revenuecat] event processing failed: ${err.message}`);
    }

    res.json({ received: true });
  });
}

module.exports = new RevenueCatController();
