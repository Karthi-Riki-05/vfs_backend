const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth.middleware");

/**
 * @swagger
 * /api/v1/openai:
 *   post:
 *     summary: DEPRECATED — use /api/v1/ai-assistant/chat instead
 *     tags: [AI]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       401:
 *         description: Unauthorized
 *       410:
 *         description: Gone — endpoint deprecated
 */
router.all("/", authenticate, (req, res) => {
  res.status(410).json({
    success: false,
    error: {
      code: "DEPRECATED",
      message:
        "This endpoint is deprecated as of May 2026. " +
        "Use /api/v1/ai-assistant/chat instead.",
    },
  });
});

module.exports = router;
