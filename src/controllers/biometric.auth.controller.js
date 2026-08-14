const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { prisma } = require("../lib/prisma");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const userService = require("../services/user.service");

/**
 * Biometric login for the native shell.
 *
 * WHY THIS EXISTS SEPARATELY
 *   The shell has no native login screen — the user signs in inside the
 *   WebView and the session is a NextAuth cookie. The mobile JWT surface
 *   (mobile.auth.controller.js) issues bearer tokens for a native-login app
 *   and cannot produce that cookie, so it is not reusable here.
 *
 * THE FLOW (see docs/be-auth-biometric.md)
 *   1. enroll   — authenticated by the user's existing web session. Mints a
 *                 long-lived device token, returned ONCE and then only ever
 *                 held on the phone, inside biometric-gated secure storage.
 *   2. exchange — open. The phone proves possession of the device token after
 *                 a successful fingerprint/Face ID check. Rotates the token
 *                 and returns a ~60-second one-time ticket.
 *   3. consume  — open, but called server-to-server by the Next.js
 *                 CredentialsProvider, never by the phone. Redeems the ticket
 *                 and returns the same payload as /api/v1/auth/validate, so
 *                 NextAuth issues its session cookie through its normal path.
 *   4. revoke   — authenticated. Drops one device or all of them.
 *
 * SECURITY POSTURE
 *   * Tokens are stored as SHA-256 hashes only — a database leak yields
 *     nothing replayable.
 *   * Every exchange ROTATES the device token. Presenting a superseded token
 *     means a copy leaked, so the device is revoked on sight (reuse
 *     detection) rather than silently issuing a session to whoever asked.
 *   * The one-time ticket is single-use and consumed atomically, so two
 *     racing redemptions cannot both win.
 *   * `deleted` / `suspendedAt` are re-checked on every open endpoint, matching
 *     login, refresh and socialLogin (BUG-007 parity). Enrolment does not
 *     grant a permanent bypass of account state.
 */

/** How long an enrolled device stays valid without being used. */
const DEVICE_TOKEN_TTL_DAYS = Number(
  process.env.BIOMETRIC_DEVICE_TTL_DAYS || 90,
);

/** Lifetime of the hand-off ticket. Seconds, deliberately tiny. */
const OTT_TTL_SECONDS = Number(process.env.BIOMETRIC_OTT_TTL_SECONDS || 60);

/** Opaque, high-entropy secret. Not a JWT: these must be revocable server-side. */
function mintToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * Reject an account that must not receive a session, mirroring validateUser.
 * Applied on every open endpoint so a phone enrolled last month cannot log in
 * to an account that has since been suspended or deleted.
 */
function assertUserLoginable(user) {
  if (!user) {
    throw new AppError("Invalid or expired token", 401, "INVALID_TOKEN");
  }
  if (user.userStatus === "deleted") {
    throw new AppError("Account has been deactivated", 401, "USER_DEACTIVATED");
  }
  if (user.suspendedAt !== null && user.suspendedAt !== undefined) {
    logger.warn(`[biometric] blocked — suspended: ${user.id}`);
    throw new AppError("Account is inactive", 401, "ACCOUNT_INACTIVE");
  }
  if (!user.emailVerified) {
    throw new AppError(
      "Please verify your email before logging in.",
      403,
      "EMAIL_NOT_VERIFIED",
    );
  }
}

class BiometricAuthController {
  /**
   * POST /api/v1/auth/biometric/enroll   (authenticate)
   *
   * Called by the web page when the user turns on "Enable biometric login",
   * so it rides the session they already hold — enrolment is never possible
   * without a fresh, real login.
   *
   * Re-enrolling the same deviceId overwrites the previous token, which is
   * also how a user recovers a device whose token was revoked.
   */
  enroll = asyncHandler(async (req, res) => {
    const { deviceId, platform, appVariant, label } = req.body;

    if (!deviceId || typeof deviceId !== "string") {
      throw new AppError("deviceId is required", 400, "VALIDATION_ERROR");
    }
    if (platform !== "ios" && platform !== "android") {
      throw new AppError(
        "platform must be 'ios' or 'android'",
        400,
        "VALIDATION_ERROR",
      );
    }

    const token = mintToken();
    const tokenHash = hashToken(token);
    const expiresAt = daysFromNow(DEVICE_TOKEN_TTL_DAYS);

    const data = {
      tokenHash,
      // A fresh enrolment starts a new chain: no predecessor to replay.
      prevTokenHash: null,
      platform,
      appVariant: appVariant === "pro" ? "pro" : "team",
      label: typeof label === "string" ? label.slice(0, 120) : null,
      expiresAt,
      lastUsedAt: new Date(),
      revokedAt: null,
      revokedReason: null,
    };

    await prisma.biometricDevice.upsert({
      where: { userId_deviceId: { userId: req.user.id, deviceId } },
      create: { userId: req.user.id, deviceId, ...data },
      update: data,
    });

    logger.info(`[biometric] enrolled: user=${req.user.id} device=${deviceId}`);

    // The raw token is returned exactly once and never persisted here.
    res.json({
      success: true,
      data: { deviceToken: token, expiresAt },
    });
  });

  /**
   * POST /api/v1/auth/biometric/exchange   (open)
   *
   * Open by necessity — the phone has no session yet; that is the whole point.
   * Possession of the device token IS the credential, which is why it lives
   * behind the OS biometric gate on the device and is rotated on every use.
   */
  exchange = asyncHandler(async (req, res) => {
    const { deviceToken } = req.body;

    if (!deviceToken || typeof deviceToken !== "string") {
      throw new AppError("deviceToken is required", 400, "VALIDATION_ERROR");
    }

    const presentedHash = hashToken(deviceToken);
    const device = await prisma.biometricDevice.findUnique({
      where: { tokenHash: presentedHash },
    });

    if (!device) {
      // Not the live token. If it is one we already rotated away from, the
      // token has been copied — the legitimate phone holds the newer one.
      // Kill the device rather than let the replay through.
      const superseded = await prisma.biometricDevice.findFirst({
        where: { prevTokenHash: presentedHash, revokedAt: null },
      });
      if (superseded) {
        await prisma.biometricDevice.update({
          where: { id: superseded.id },
          data: { revokedAt: new Date(), revokedReason: "token_reuse" },
        });
        logger.warn(
          `[biometric] token reuse — revoked device=${superseded.deviceId} user=${superseded.userId}`,
        );
      }
      throw new AppError("Invalid or expired token", 401, "INVALID_TOKEN");
    }

    if (device.revokedAt) {
      throw new AppError("Device access revoked", 401, "DEVICE_REVOKED");
    }
    if (device.expiresAt.getTime() <= Date.now()) {
      throw new AppError("Device enrolment expired", 401, "DEVICE_EXPIRED");
    }

    const user = await prisma.user.findUnique({
      where: { id: device.userId },
      select: {
        id: true,
        userStatus: true,
        suspendedAt: true,
        emailVerified: true,
      },
    });
    assertUserLoginable(user);

    // Rotate: the token just used becomes the tripwire for reuse detection.
    const nextToken = mintToken();
    await prisma.biometricDevice.update({
      where: { id: device.id },
      data: {
        tokenHash: hashToken(nextToken),
        prevTokenHash: device.tokenHash,
        lastUsedAt: new Date(),
      },
    });

    const ott = mintToken();
    await prisma.biometricOtt.create({
      data: {
        tokenHash: hashToken(ott),
        userId: device.userId,
        deviceId: device.deviceId,
        expiresAt: new Date(Date.now() + OTT_TTL_SECONDS * 1000),
      },
    });

    logger.info(
      `[biometric] exchange ok: user=${device.userId} device=${device.deviceId}`,
    );

    res.json({
      success: true,
      data: { deviceToken: nextToken, ott, expiresIn: OTT_TTL_SECONDS },
    });
  });

  /**
   * POST /api/v1/auth/biometric/consume   (open — server-to-server)
   *
   * Redeems the hand-off ticket. Returns the SAME payload shape as
   * /api/v1/auth/validate so the NextAuth CredentialsProvider can treat the
   * two identically.
   *
   * Note: unlike validateUser this does NOT call securityAlert.checkLoginDevice.
   * The caller is the Next.js server, so the ip/user-agent it would record are
   * the server's, not the user's — every biometric login would look like the
   * same "new device" and the alert would be noise.
   */
  consume = asyncHandler(async (req, res) => {
    const { ott } = req.body;

    if (!ott || typeof ott !== "string") {
      throw new AppError("ott is required", 400, "VALIDATION_ERROR");
    }

    // Atomic claim: the consumedAt guard is inside the WHERE, so of two racing
    // redemptions exactly one can match and update.
    const claimed = await prisma.biometricOtt.updateMany({
      where: {
        tokenHash: hashToken(ott),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });

    if (claimed.count === 0) {
      throw new AppError("Invalid or expired token", 401, "INVALID_TOKEN");
    }

    const record = await prisma.biometricOtt.findUnique({
      where: { tokenHash: hashToken(ott) },
    });

    const user = await prisma.user.findUnique({ where: { id: record.userId } });
    assertUserLoginable(user);

    const token = jwt.sign(
      { sub: user.id, email: user.email, name: user.name, role: user.role },
      process.env.NEXTAUTH_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
    );

    const hasTeamAccess = await userService.getHasTeamAccess(user.id);

    logger.info(
      `[biometric] login: user=${user.id} device=${record.deviceId}`,
    );

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        hasPro: user.hasPro,
        currentVersion: user.currentVersion,
        hasTeamAccess,
        token,
      },
    });
  });

  /**
   * POST /api/v1/auth/biometric/revoke   (authenticate)
   *
   * `{ deviceId }` drops one phone; `{ allDevices: true }` drops every one.
   * Requiring an explicit choice mirrors the FCM unregister rule (AUTH-C3) so
   * a malformed client cannot wipe every device by omission.
   */
  revoke = asyncHandler(async (req, res) => {
    const { deviceId, allDevices } = req.body;

    if (!deviceId && allDevices !== true) {
      throw new AppError(
        "deviceId is required (or allDevices: true)",
        400,
        "DEVICE_ID_REQUIRED",
      );
    }

    const result = await prisma.biometricDevice.updateMany({
      where: {
        userId: req.user.id,
        revokedAt: null,
        ...(allDevices === true ? {} : { deviceId }),
      },
      data: { revokedAt: new Date(), revokedReason: "user_revoked" },
    });

    logger.info(
      `[biometric] revoked ${result.count} device(s) for user=${req.user.id}`,
    );

    res.json({ success: true, data: { revokedCount: result.count } });
  });

  /**
   * GET /api/v1/auth/biometric/devices   (authenticate)
   *
   * Powers a "your devices" list. Never exposes a token or its hash.
   */
  listDevices = asyncHandler(async (req, res) => {
    const devices = await prisma.biometricDevice.findMany({
      where: { userId: req.user.id, revokedAt: null },
      select: {
        deviceId: true,
        platform: true,
        appVariant: true,
        label: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
      orderBy: { lastUsedAt: "desc" },
    });

    res.json({ success: true, data: { devices } });
  });
}

module.exports = new BiometricAuthController();
