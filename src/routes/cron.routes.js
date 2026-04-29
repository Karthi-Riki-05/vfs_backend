const express = require("express");
const router = express.Router();
const flowService = require("../services/flow.service");
const subscriptionService = require("../services/subscription.service");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");

function requireCronSecret(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error("CRON_SECRET is not configured — refusing to run cron");
    res.status(503).json({
      success: false,
      error: { code: "CRON_NOT_CONFIGURED", message: "Cron not configured" },
    });
    return false;
  }
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
    });
    return false;
  }
  return true;
}

/**
 * POST /api/v1/cron/purge-trash
 * Permanently deletes flows that have been in trash for more than 30 days.
 * Intended to be called by a cron job / scheduled task.
 * Protected by a simple secret token in the Authorization header.
 */
router.post(
  "/purge-trash",
  asyncHandler(async (req, res) => {
    if (!requireCronSecret(req, res)) return;
    const result = await flowService.purgeOldTrash(30);
    logger.info(
      `Purge trash: deleted ${result.count} flows older than 30 days`,
    );
    res.json({ success: true, data: { deleted: result.count } });
  }),
);

/**
 * POST /api/v1/cron/activate-scheduled-plans
 * Activates any subscription whose `scheduledActivationDate` has arrived.
 * Charges the customer's saved Stripe payment method off-session and swaps
 * the subscription record onto the new plan (Case 2: Monthly→Yearly).
 */
router.post(
  "/activate-scheduled-plans",
  asyncHandler(async (req, res) => {
    if (!requireCronSecret(req, res)) return;
    const result = await subscriptionService.runScheduledActivations();
    logger.info(
      `Cron activate-scheduled-plans: processed=${result.processed} activated=${result.activated} failed=${result.failed}`,
    );
    res.json({ success: true, data: result });
  }),
);

/**
 * POST /api/v1/cron/check-flow-pack-expiry
 * Daily: notifications (7/3/1d), grace transition, expiry + flow picker
 * trigger, and trash purge for downgrade-flagged flows.
 */
router.post(
  "/check-flow-pack-expiry",
  asyncHandler(async (req, res) => {
    if (!requireCronSecret(req, res)) return;
    const flowPackExpiry = require("../services/flowPackExpiry.service");
    const result = await flowPackExpiry.runDailyCheck();
    res.json({ success: true, data: result });
  }),
);

module.exports = router;
