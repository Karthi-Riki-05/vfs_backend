const express = require("express");
const router = express.Router();
const iapController = require("../controllers/iap.controller");
const { authenticate } = require("../middleware/auth.middleware");
const validate = require("../middleware/validate");
const { validatePurchaseSchema } = require("../validators/iap.validator");

// Store server callbacks — no user auth; each carries its own authenticity
// check (RTDN shared token / Apple JWS signature chain).
router.post("/google/rtdn", iapController.googleRtdn);
router.post("/apple/notifications", iapController.appleNotifications);

/**
 * @swagger
 * /api/v1/iap/validate:
 *   post:
 *     summary: Validate a native in-app purchase and grant its entitlement
 *     tags: [IAP]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [store, productId]
 *             properties:
 *               store:
 *                 type: string
 *                 enum: [google_play, app_store]
 *               productId:
 *                 type: string
 *               purchaseToken:
 *                 type: string
 *                 description: Google Play purchase token (google_play only)
 *               packageName:
 *                 type: string
 *                 description: Shell package name (google_play only)
 *               receiptData:
 *                 type: string
 *                 description: Base64 app receipt (app_store only)
 *     responses:
 *       200:
 *         description: Purchase validated; entitlement granted or already granted
 *       400:
 *         description: Store rejected the token/receipt
 *       403:
 *         description: Purchase belongs to a different account
 */
router.post(
  "/validate",
  authenticate,
  validate(validatePurchaseSchema),
  iapController.validate,
);

module.exports = router;
