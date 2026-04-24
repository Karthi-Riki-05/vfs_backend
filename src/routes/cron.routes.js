const express = require("express");
const router = express.Router();
const flowService = require("../services/flow.service");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");

/**
 * POST /api/v1/cron/purge-trash
 * Permanently deletes flows that have been in trash for more than 30 days.
 * Intended to be called by a cron job / scheduled task.
 * Protected by a simple secret token in the Authorization header.
 */
router.post(
  "/purge-trash",
  asyncHandler(async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    // Refuse to run if the secret is not configured — the original guard
    // silently made this endpoint public when CRON_SECRET was missing.
    if (!cronSecret) {
      logger.error(
        "CRON_SECRET is not configured — refusing to run purge-trash",
      );
      return res.status(503).json({
        success: false,
        error: { code: "CRON_NOT_CONFIGURED", message: "Cron not configured" },
      });
    }
    if (req.headers.authorization !== `Bearer ${cronSecret}`) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Unauthorized" },
      });
    }

    const result = await flowService.purgeOldTrash(30);
    logger.info(
      `Purge trash: deleted ${result.count} flows older than 30 days`,
    );
    res.json({ success: true, data: { deleted: result.count } });
  }),
);

module.exports = router;
