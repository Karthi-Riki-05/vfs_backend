const router = require("express").Router();
const c = require("../controllers/mobile.auth.controller");
const { authenticate } = require("../middleware/auth.middleware");
// bug-U2: the mobile credential endpoints had only the global 600/2-min IP
// limiter, so passwords could be brute-forced against the same argon2 hashes
// the web `authLimiter` (10/15-min) protects. Apply the same limiter here.
const { authLimiter } = require("../middleware/rateLimiter");

/**
 * @swagger
 * tags:
 *   name: Mobile Auth
 *   description: Mobile app authentication and editor bridge endpoints
 */

/**
 * @swagger
 * /api/v1/auth/mobile/login:
 *   post:
 *     summary: Mobile app email/password login
 *     tags: [Mobile Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: john@example.com }
 *               password: { type: string, example: securePassword123 }
 *     responses:
 *       200:
 *         description: Login successful, returns access + refresh tokens
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken: { type: string }
 *                     refreshToken: { type: string }
 *                     user:
 *                       type: object
 *                       properties:
 *                         id: { type: string }
 *                         name: { type: string }
 *                         email: { type: string }
 *                         image: { type: string, nullable: true }
 *                         currentVersion: { type: string, example: free }
 *                         hasPro: { type: boolean }
 *       400: { description: Validation error }
 *       401: { description: Invalid credentials or deactivated account }
 */
router.post("/login", authLimiter, c.login);

/**
 * @swagger
 * /api/v1/auth/mobile/refresh:
 *   post:
 *     summary: Exchange a refresh token for a new access token
 *     tags: [Mobile Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: New access token issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken: { type: string }
 *       400: { description: Missing refresh token }
 *       401: { description: Invalid or expired refresh token }
 */
router.post("/refresh", authLimiter, c.refresh);

/**
 * @swagger
 * /api/v1/auth/mobile/social:
 *   post:
 *     summary: Social login (Google or Apple) via ID token
 *     tags: [Mobile Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [provider, idToken]
 *             properties:
 *               provider: { type: string, enum: [google, apple] }
 *               idToken: { type: string, description: Provider-issued ID token }
 *               name: { type: string, description: Optional (Apple only, first login) }
 *     responses:
 *       200:
 *         description: Login successful, returns access + refresh tokens
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken: { type: string }
 *                     refreshToken: { type: string }
 *                     user: { type: object }
 *       400: { description: Invalid provider or missing email }
 *       401: { description: Account deactivated }
 */
router.post("/social", authLimiter, c.socialLogin);

/**
 * @swagger
 * /api/v1/auth/mobile/logout:
 *   post:
 *     summary: Logout mobile session (clears stored refresh token)
 *     tags: [Mobile Auth]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: Logged out (idempotent — always returns success)
 */
router.post("/logout", c.logout);

/**
 * @swagger
 * /api/v1/auth/mobile/entitlements:
 *   get:
 *     summary: Get current user's subscription entitlements
 *     tags: [Mobile Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Entitlements for the authenticated user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     hasPro: { type: boolean }
 *                     currentVersion: { type: string, example: free }
 *                     proFlowLimit: { type: integer, nullable: true }
 *                     proUnlimitedFlows: { type: boolean }
 *       401: { description: Unauthorized }
 *       404: { description: User not found }
 */
router.get("/entitlements", authenticate, c.getEntitlements);

/**
 * @swagger
 * /api/v1/auth/mobile/fcm-token:
 *   post:
 *     summary: Register or update the FCM push-notification token for the user
 *     tags: [Mobile Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fcmToken]
 *             properties:
 *               fcmToken: { type: string }
 *     responses:
 *       200: { description: FCM token registered }
 *       400: { description: Missing fcmToken }
 *       401: { description: Unauthorized }
 */
router.post("/fcm-token", authenticate, c.registerFcmToken);

/**
 * @swagger
 * /api/v1/auth/mobile/fcm-token:
 *   delete:
 *     summary: Unregister an FCM token on logout (one device, or all if omitted)
 *     tags: [Mobile Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fcmToken: { type: string }
 *     responses:
 *       200: { description: FCM token unregistered }
 *       401: { description: Unauthorized }
 */
router.delete("/fcm-token", authenticate, c.unregisterFcmToken);

/**
 * @swagger
 * /api/v1/auth/mobile/editor-url/{flowId}:
 *   get:
 *     summary: Generate a short-lived web-browser URL to open the flow editor from mobile
 *     description: Returns a URL with a 1-hour JWT that loads /mobile/editor/:flowId in the browser.
 *     tags: [Mobile Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: flowId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Editor URL generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     url: { type: string, example: "http://localhost:3000/mobile/editor/abc123?token=eyJ..." }
 *                     expiresIn: { type: integer, example: 3600 }
 *       401: { description: Unauthorized }
 *       404: { description: Flow not found or access denied }
 */
router.get("/editor-url/:flowId", authenticate, c.getMobileEditorUrl);

/**
 * @swagger
 * /api/v1/auth/mobile/register-device:
 *   post:
 *     summary: Register a mobile device (FCM token + metadata)
 *     tags: [Mobile Auth]
 *     security: [{ bearerAuth: [] }]
 */
router.post("/register-device", authenticate, c.registerDevice);

/**
 * @swagger
 * /api/v1/auth/mobile/app-version:
 *   get:
 *     summary: Build/force-update gate for mobile clients
 *     tags: [Mobile Auth]
 *     parameters:
 *       - in: query
 *         name: platform
 *         schema: { type: string, enum: [ios, android] }
 *       - in: query
 *         name: version
 *         schema: { type: string, example: "1.2.0" }
 */
router.get("/app-version", c.appVersion);

/**
 * @swagger
 * /api/v1/auth/mobile/forgot-password:
 *   post:
 *     summary: Request a password reset code for the native app (email, not link)
 *     tags: [Mobile Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Always success, does not reveal account existence }
 */
router.post("/forgot-password", authLimiter, c.forgotPassword);

/**
 * @swagger
 * /api/v1/auth/mobile/reset-password-otp:
 *   post:
 *     summary: Reset password using the 6-digit code from forgot-password
 *     tags: [Mobile Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp, newPassword]
 *             properties:
 *               email: { type: string, format: email }
 *               otp: { type: string, example: "123456" }
 *               newPassword: { type: string }
 *     responses:
 *       200: { description: Password reset }
 *       400: { description: Invalid or expired code }
 */
router.post("/reset-password-otp", authLimiter, c.resetPasswordOtp);

/**
 * @swagger
 * /api/v1/auth/mobile/handoff-ott:
 *   post:
 *     summary: Mint a one-time ticket so the WebView can pick up the native session
 *     description: >
 *       Call this right after a successful native login/register/social
 *       sign-in. Load the returned ott via the shell's existing
 *       nativeAuthUrl(ott) helper (same one biometric unlock already uses)
 *       to open the WebView pre-authenticated.
 *     tags: [Mobile Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: One-time ticket minted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     ott: { type: string }
 *                     expiresIn: { type: integer, example: 60 }
 */
router.post("/handoff-ott", authenticate, c.handoffOtt);

module.exports = router;
