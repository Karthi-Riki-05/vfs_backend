const router = require("express").Router();
const c = require("../controllers/biometric.auth.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { biometricLimiter } = require("../middleware/rateLimiter");

/**
 * @swagger
 * tags:
 *   name: Biometric Auth
 *   description: >
 *     Fingerprint / Face ID login for the native WebView shell. The shell has
 *     no native login screen — the user signs in inside the WebView and holds a
 *     NextAuth cookie — so this surface exists to turn a biometric unlock back
 *     into that cookie. See docs/be-auth-biometric.md.
 */

/**
 * @swagger
 * /api/v1/auth/biometric/enroll:
 *   post:
 *     summary: Enrol this device for biometric login
 *     description: >
 *       Rides the user's existing web session, so enrolment is only ever
 *       possible straight after a real login. Returns the device token ONCE;
 *       it is never retrievable again and must be written to biometric-gated
 *       secure storage on the phone. Re-enrolling the same deviceId replaces
 *       the previous token.
 *     tags: [Biometric Auth]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [deviceId, platform]
 *             properties:
 *               deviceId:   { type: string, description: Stable per-install id }
 *               platform:   { type: string, enum: [ios, android] }
 *               appVariant: { type: string, enum: [pro, team] }
 *               label:      { type: string, example: "iPhone 15" }
 *     responses:
 *       200:
 *         description: Device enrolled; token returned once
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     deviceToken: { type: string }
 *                     expiresAt:   { type: string, format: date-time }
 *       400: { description: Missing or invalid deviceId / platform }
 *       401: { description: Not authenticated }
 */
router.post("/enroll", authenticate, c.enroll);

/**
 * @swagger
 * /api/v1/auth/biometric/exchange:
 *   post:
 *     summary: Exchange a device token for a one-time login ticket
 *     description: >
 *       Called by the shell after the OS confirms the fingerprint / Face ID.
 *       Open by necessity — the phone has no session yet. Possession of the
 *       device token is the credential, so the token is ROTATED on every call
 *       and the response carries its replacement, which the shell must store.
 *       Presenting a superseded token is treated as a leaked copy and revokes
 *       the device.
 *     tags: [Biometric Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [deviceToken]
 *             properties:
 *               deviceToken: { type: string }
 *     responses:
 *       200:
 *         description: Rotated device token plus a short-lived ticket
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     deviceToken: { type: string, description: Store this; the old one is now dead }
 *                     ott:         { type: string }
 *                     expiresIn:   { type: integer, example: 60 }
 *       400: { description: Missing deviceToken }
 *       401: { description: Invalid, revoked, or expired; or account not loginable }
 */
router.post("/exchange", biometricLimiter, c.exchange);

/**
 * @swagger
 * /api/v1/auth/biometric/consume:
 *   post:
 *     summary: Redeem a one-time ticket (server-to-server)
 *     description: >
 *       Called by the Next.js CredentialsProvider, never by the phone. Returns
 *       the same payload as /api/v1/auth/validate so NextAuth can issue its
 *       session cookie through its normal path. Single-use and claimed
 *       atomically, so two racing redemptions cannot both succeed.
 *     tags: [Biometric Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ott]
 *             properties:
 *               ott: { type: string }
 *     responses:
 *       200: { description: User payload identical in shape to /auth/validate }
 *       400: { description: Missing ott }
 *       401: { description: Ticket invalid, already used, or expired }
 *       403: { description: Email not verified }
 */
router.post("/consume", biometricLimiter, c.consume);

/**
 * @swagger
 * /api/v1/auth/biometric/revoke:
 *   post:
 *     summary: Revoke biometric access for one device or all
 *     description: >
 *       Requires an explicit target — `deviceId`, or `allDevices: true`. The
 *       explicitness mirrors the FCM unregister rule (AUTH-C3) so a malformed
 *       client cannot wipe every device by omission.
 *     tags: [Biometric Auth]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deviceId:   { type: string }
 *               allDevices: { type: boolean }
 *     responses:
 *       200: { description: Count of devices revoked }
 *       400: { description: Neither deviceId nor allDevices given }
 *       401: { description: Not authenticated }
 */
router.post("/revoke", authenticate, c.revoke);

/**
 * @swagger
 * /api/v1/auth/biometric/devices:
 *   get:
 *     summary: List the user's enrolled devices
 *     description: Never exposes a token or its hash.
 *     tags: [Biometric Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Enrolled, non-revoked devices, most recently used first }
 *       401: { description: Not authenticated }
 */
router.get("/devices", authenticate, c.listDevices);

module.exports = router;
