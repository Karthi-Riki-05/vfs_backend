const router = require("express").Router();
const c = require("../controllers/native.google.controller");
const { biometricLimiter } = require("../middleware/rateLimiter");

/**
 * @swagger
 * tags:
 *   name: Native Auth
 *   description: >
 *     Sign-in methods the native shell performs OUTSIDE the WebView, because
 *     the WebView cannot perform them itself. Each one ends the same way: a
 *     short-lived one-time ticket the shell redeems at /native?ott=…, so the
 *     session cookie is always minted by NextAuth. See docs/be-auth-native-google.md.
 */

/**
 * @swagger
 * /api/v1/auth/native/google:
 *   post:
 *     summary: Turn a native Google ID token into a one-time login ticket
 *     description: >
 *       Deliberately UNAUTHENTICATED — it runs before any session exists. The
 *       Google-signed ID token is the credential: the signature is verified
 *       against Google's keys and the audience must match a configured client
 *       id, so a token minted for another app is refused. An account is created
 *       on first sign-in (email-verified, since Google asserts it).
 *
 *       The returned ticket is single-use and lives ~60 seconds. It is redeemed
 *       server-to-server by the NextAuth provider, never by the phone.
 *     tags: [Native Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idToken]
 *             properties:
 *               idToken:    { type: string, description: Google-issued ID token }
 *               deviceId:   { type: string, description: Stable per-install id, for the audit trail }
 *               appVariant: { type: string, enum: [pro, team] }
 *     responses:
 *       200:
 *         description: Ticket issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     ott:       { type: string }
 *                     expiresIn: { type: integer, example: 60 }
 *       400: { description: Missing idToken, or Google shared no email }
 *       401: { description: Invalid/expired token, unverified email, or account suspended/deleted }
 *       500: { description: GOOGLE_CLIENT_ID not configured }
 */
router.post("/google", biometricLimiter, c.login);

module.exports = router;
