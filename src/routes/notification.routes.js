const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notification.controller");
const { authenticate } = require("../middleware/auth.middleware");
const devOnly = require("../middleware/devOnly");
const validate = require("../middleware/validate");
const {
  testScheduleExpirySchema,
} = require("../validators/notificationTest.validator");

router.get("/", authenticate, notificationController.list);
router.get("/count", authenticate, notificationController.count);
router.put("/read-all", authenticate, notificationController.markAllRead);
router.put("/:id/read", authenticate, notificationController.markRead);
// Literal /delete-all MUST precede /:id so the param route doesn't swallow it.
router.delete("/delete-all", authenticate, notificationController.deleteAll);
router.delete("/:id", authenticate, notificationController.remove);

/**
 * @openapi
 * /api/v1/notifications/test-schedule-expiry:
 *   post:
 *     tags: [Notifications]
 *     summary: "[DEV] Schedule a plan / flow-pack expiry N minutes from now"
 *     description: >
 *       Dev/test-only. Back-dates the user's subscription and/or flow-pack
 *       expiry timestamps so the expiry-checker cron treats them as lapsing at
 *       `now + expiryMinutes`. Pair with /trigger-expiry-check to fire the
 *       mobile notifications immediately. Disabled in production.
 *       Note: only the flow-pack path sends FCM pushes; subscription expiry
 *       creates an in-app notification only. If target includes `flowpack` and
 *       the user has no active pack, a mock one is auto-seeded (one-click test).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: mry@test.com
 *               expiryMinutes:
 *                 type: integer
 *                 default: 2
 *                 minimum: -1440
 *                 maximum: 1440
 *                 description: Minutes from now until the row lapses. Negatives simulate already-expired.
 *                 example: 2
 *               target:
 *                 type: string
 *                 enum: [subscription, flowpack, both]
 *                 default: both
 *     responses:
 *       200:
 *         description: Expiry scheduled; returns what was updated and any warnings.
 *       404:
 *         description: No user found for the given email.
 *       403:
 *         description: Disabled in production.
 */
router.post(
  "/test-schedule-expiry",
  devOnly,
  validate(testScheduleExpirySchema),
  notificationController.testScheduleExpiry,
);

/**
 * @openapi
 * /api/v1/notifications/trigger-expiry-check:
 *   post:
 *     tags: [Notifications]
 *     summary: "[DEV] Run the subscription + flow-pack expiry checkers now"
 *     description: >
 *       Dev/test-only. Immediately runs expireLapsedSubscriptions() and the
 *       flow-pack runDailyCheck()/checkPastDueGrace() instead of waiting for the
 *       daily cron, so scheduled expiries are processed and pushes sent on
 *       demand. Disabled in production. (Production schedulers should use the
 *       CRON_SECRET-protected /api/v1/cron/* endpoints instead.)
 *     responses:
 *       200:
 *         description: Checkers ran; returns per-checker summaries.
 *       403:
 *         description: Disabled in production.
 */
router.post(
  "/trigger-expiry-check",
  devOnly,
  notificationController.triggerExpiryCheck,
);

module.exports = router;
