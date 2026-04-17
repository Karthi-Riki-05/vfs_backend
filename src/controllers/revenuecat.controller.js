const { prisma } = require("../lib/prisma");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");

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
      return res
        .status(401)
        .json({
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
      return res
        .status(400)
        .json({
          success: false,
          error: {
            code: "INVALID_BODY",
            message: "Could not parse request body",
          },
        });
    }

    const event = body.event || {};
    const { type, app_user_id, product_id } = event;

    logger.info(
      `[revenuecat] event type=${type} user=${app_user_id} product=${product_id}`,
    );

    try {
      if (type === "INITIAL_PURCHASE" || type === "RENEWAL") {
        const entitlements = PRODUCT_MAP[product_id];
        if (entitlements && app_user_id) {
          await prisma.user.update({
            where: { id: app_user_id },
            data: { ...entitlements, proPurchasedAt: new Date() },
          });
          logger.info(
            `[revenuecat] upgraded user ${app_user_id} to pro (${product_id})`,
          );
        }
      } else if (type === "CANCELLATION" || type === "EXPIRATION") {
        if (app_user_id) {
          await prisma.user.update({
            where: { id: app_user_id },
            data: { hasPro: false, currentVersion: "free" },
          });
          logger.info(`[revenuecat] downgraded user ${app_user_id} to free`);
        }
      }
    } catch (err) {
      logger.error(`[revenuecat] DB update failed: ${err.message}`);
      // Still respond 200 to prevent RevenueCat retries for DB errors
    }

    res.json({ received: true });
  });
}

module.exports = new RevenueCatController();
