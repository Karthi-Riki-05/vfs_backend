"use strict";

const { prisma } = require("../lib/prisma");
const { grantProCredits } = require("../lib/grantProCredits");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");

// NOTE: Flow packs (flow add-on 'standard_100' / 'unlimited') are WEB-ONLY
// purchases via Stripe Checkout — they are intentionally absent here.
// Adding them requires a business decision plus App Store / Play Store
// products and a flow_addon handler mirroring
// proService.handleFlowAddonCheckoutWebhook. See FLOWPACK_AUDIT.md Gap #9.
const PRODUCT_MAP = {
  valuechart_pro_monthly: { hasPro: true, currentVersion: "pro" },
  valuechart_pro_yearly: { hasPro: true, currentVersion: "pro" },
  valuechart_free: { hasPro: false, currentVersion: "free" },
};

class RevenueCatController {
  handleWebhook = asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    const expected = "Bearer " + process.env.REVENUECAT_WEBHOOK_SECRET;

    if (!authHeader || authHeader !== expected) {
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
    const { type, app_user_id, product_id, transaction_id, price, currency } =
      event;

    logger.info(
      `[revenuecat] event type=${type} user=${app_user_id} product=${product_id}`,
    );

    try {
      if (type === "INITIAL_PURCHASE" || type === "RENEWAL") {
        const entitlements = PRODUCT_MAP[product_id];
        if (!entitlements || !app_user_id) {
          logger.warn(
            `[revenuecat] unknown product or missing user — type=${type} product=${product_id}`,
          );
          return res.json({ received: true });
        }

        if (!entitlements.hasPro) {
          // valuechart_free — just downgrade, handled by CANCELLATION path
          return res.json({ received: true });
        }

        // Grant Pro access + credits atomically
        await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: app_user_id },
            data: { ...entitlements, proPurchasedAt: new Date() },
          });

          await grantProCredits(
            app_user_id,
            {
              txnId: transaction_id || null,
              amountCharged: price != null ? Math.round(price * 100) : 500,
              currency: (currency || "usd").toLowerCase(),
              paymentMethod: "in_app_purchase",
            },
            tx,
          );
        });

        logger.info(
          `[revenuecat] upgraded user ${app_user_id} to pro (${product_id})`,
        );
      } else if (type === "CANCELLATION" || type === "EXPIRATION") {
        if (!app_user_id) return res.json({ received: true });

        // Revoke Pro: null proPurchasedAt so userTier.js no longer returns 'pro'
        await prisma.user.update({
          where: { id: app_user_id },
          data: {
            hasPro: false,
            proPurchasedAt: null,
            currentVersion: "free",
          },
        });

        // Pro = one-time LIFETIME purchase. Cancellation/expiry of the
        // RevenueCat entitlement must NOT zero any credits — both plan and
        // addon Pro credits stay forever. (Intentionally no credit update.)

        logger.info(
          `[revenuecat] downgraded user ${app_user_id} to free (${type})`,
        );
      }
    } catch (err) {
      logger.error(`[revenuecat] DB update failed: ${err.message}`);
      // Respond 200 to prevent RevenueCat retry loops for transient DB errors.
      // RevenueCat will retry on network/5xx errors; we handle dedup via txnId.
    }

    res.json({ received: true });
  });
}

module.exports = new RevenueCatController();
