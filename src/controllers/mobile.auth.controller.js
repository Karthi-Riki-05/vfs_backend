const jwt = require("jsonwebtoken");
const argon2 = require("argon2");
const { OAuth2Client } = require("google-auth-library");
const appleSignin = require("apple-signin-auth");
const { prisma } = require("../lib/prisma");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const flowService = require("../services/flow.service");

function signAccessToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function signRefreshToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

// Resolve which app a device registration belongs to. Only "pro" or "team"
// are ever stored — there is no "free" app: a free user is simply a
// team-context user with no active subscription, so any non-"pro" value
// (including the legacy "free" some clients may still send) folds into
// "team". Same X-App-Context header convention used across every other
// controller (see notification.controller.js resolveContext).
function resolveDeviceAppContext(req) {
  const raw = (
    req.headers["x-app-context"] ||
    req.user?.currentVersion ||
    "team"
  ).toLowerCase();
  return raw === "pro" ? "pro" : "team";
}

function userPayload(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    currentVersion: user.currentVersion || "free",
    hasPro: user.hasPro || false,
  };
}

class MobileAuthController {
  login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError(
        "Email and password are required",
        400,
        "VALIDATION_ERROR",
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        password: true,
        userStatus: true,
        suspendedAt: true,
        currentVersion: true,
        hasPro: true,
        proFlowLimit: true,
        proUnlimitedFlows: true,
      },
    });

    if (!user || !user.password) {
      throw new AppError(
        "Invalid email or password",
        401,
        "INVALID_CREDENTIALS",
      );
    }

    if (user.userStatus === "deleted") {
      throw new AppError(
        "Account has been deactivated",
        401,
        "USER_DEACTIVATED",
      );
    }

    // BUG-007: suspended accounts cannot log in (parity with web login,
    // socialLogin, and the authenticate middleware).
    if (user.suspendedAt !== null && user.suspendedAt !== undefined) {
      logger.warn(`[mobile] login blocked — suspended: ${user.id}`);
      throw new AppError("Account is inactive", 401, "ACCOUNT_INACTIVE");
    }

    const valid = await argon2.verify(user.password, password);
    if (!valid) {
      throw new AppError(
        "Invalid email or password",
        401,
        "INVALID_CREDENTIALS",
      );
    }

    const accessToken = signAccessToken(user.id);
    const refreshToken = signRefreshToken(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken },
    });

    logger.info(`[mobile] login: ${user.id}`);

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: userPayload(user),
      },
    });
  });

  refresh = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError("Refresh token required", 400, "VALIDATION_ERROR");
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch {
      throw new AppError(
        "Invalid or expired refresh token",
        401,
        "INVALID_TOKEN",
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        refreshToken: true,
        userStatus: true,
        suspendedAt: true,
      },
    });

    if (!user || user.refreshToken !== refreshToken) {
      throw new AppError(
        "Refresh token mismatch or user not found",
        401,
        "INVALID_TOKEN",
      );
    }

    if (user.userStatus === "deleted") {
      throw new AppError(
        "Account has been deactivated",
        401,
        "USER_DEACTIVATED",
      );
    }

    // BUG-007: a suspended account cannot mint fresh access tokens via refresh.
    if (user.suspendedAt !== null && user.suspendedAt !== undefined) {
      logger.warn(`[mobile] refresh blocked — suspended: ${user.id}`);
      throw new AppError("Account is inactive", 401, "ACCOUNT_INACTIVE");
    }

    const accessToken = signAccessToken(user.id);

    res.json({ success: true, data: { accessToken } });
  });

  socialLogin = asyncHandler(async (req, res) => {
    const { provider, idToken } = req.body;

    if (!provider || !idToken) {
      throw new AppError(
        "provider and idToken are required",
        400,
        "VALIDATION_ERROR",
      );
    }

    let email, name, image;

    if (provider === "google") {
      let payload;
      try {
        const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
        const ticket = await client.verifyIdToken({
          idToken,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
      } catch (err) {
        // Issue 1: malformed/invalid/expired token → 401, never a 500 with a
        // leaked library message.
        logger.warn(`[mobile] google idToken verify failed: ${err.message}`);
        throw new AppError("Invalid or expired token", 401, "INVALID_TOKEN");
      }
      // Issue 2: Google asserts whether the email is verified. An unverified
      // provider email must NOT be trusted as an identity key (account-takeover
      // vector — see bug-006).
      if (payload.email_verified !== true) {
        throw new AppError(
          "Email not verified by provider",
          401,
          "SOCIAL_EMAIL_NOT_VERIFIED",
        );
      }
      email = payload.email;
      name = payload.name;
      image = payload.picture;
    } else if (provider === "apple") {
      let applePayload;
      try {
        applePayload = await appleSignin.verifyIdToken(idToken, {
          audience: process.env.APPLE_CLIENT_ID,
          ignoreExpiration: false,
        });
      } catch (err) {
        // Issue 1: same hardening for Apple — Apple signature-verifies the
        // token, so a failure here means the token is invalid/expired.
        logger.warn(`[mobile] apple idToken verify failed: ${err.message}`);
        throw new AppError("Invalid or expired token", 401, "INVALID_TOKEN");
      }
      email = applePayload.email;
      name = req.body.name || null;
      image = null;
    } else {
      throw new AppError("Unsupported provider", 400, "INVALID_PROVIDER");
    }

    if (!email) {
      throw new AppError(
        "Could not retrieve email from social token",
        400,
        "SOCIAL_NO_EMAIL",
      );
    }

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: name || email.split("@")[0],
          image: image || null,
          role: "Viewer",
          // Issue 4: the provider has verified this email (Google
          // email_verified===true, or Apple signature-verified), so the new
          // account is email-verified — consistent with the credentials gate.
          emailVerified: new Date(),
        },
      });
      logger.info(`[mobile] social user created via ${provider}: ${user.id}`);
    } else {
      const updates = {};
      if (!user.image && image) updates.image = image;
      if (!user.name && name) updates.name = name;
      if (Object.keys(updates).length > 0) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: updates,
        });
      }
    }

    if (user.userStatus === "deleted") {
      throw new AppError(
        "Account has been deactivated",
        401,
        "USER_DEACTIVATED",
      );
    }

    // Issue 3: suspended accounts cannot log in via social either (parity with
    // credentials login and the authenticate middleware).
    if (user.suspendedAt !== null && user.suspendedAt !== undefined) {
      logger.warn(`[mobile] social login blocked — suspended: ${user.id}`);
      throw new AppError("Account is inactive", 401, "ACCOUNT_INACTIVE");
    }

    const accessToken = signAccessToken(user.id);
    const refreshToken = signRefreshToken(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken },
    });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: userPayload(user),
      },
    });
  });

  logout = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
        await prisma.user.update({
          where: { id: decoded.id },
          data: { refreshToken: null },
        });
      } catch {
        // Token invalid — still respond success (idempotent logout)
      }
    }

    res.json({ success: true, data: { message: "Logged out successfully" } });
  });

  getEntitlements = asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        hasPro: true,
        currentVersion: true,
        proFlowLimit: true,
        proUnlimitedFlows: true,
      },
    });

    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");

    res.json({
      success: true,
      data: {
        hasPro: user.hasPro,
        currentVersion: user.currentVersion,
        proFlowLimit: user.proFlowLimit,
        proUnlimitedFlows: user.proUnlimitedFlows,
      },
    });
  });

  // Multi-device: upsert keyed on the COMPOSITE (userId, fcmToken), never the
  // userId alone — so a second device adds a row instead of overwriting the
  // first. Re-registering the same device clears any soft-delete flag.
  registerFcmToken = asyncHandler(async (req, res) => {
    const { fcmToken } = req.body;

    if (!fcmToken) {
      throw new AppError("fcmToken is required", 400, "VALIDATION_ERROR");
    }

    const appContext = resolveDeviceAppContext(req);

    await prisma.firebaseUser.upsert({
      where: { userId_fcmToken: { userId: req.user.id, fcmToken } },
      create: {
        userId: req.user.id,
        fcmToken,
        appContext,
        updatedAt: new Date(),
      },
      update: {
        deletedAt: null,
        appContext,
        updatedAt: new Date(),
      },
    });

    res.json({ success: true, data: { message: "FCM token registered" } });
  });

  // Remove a device token on logout. With a specific fcmToken, deletes just
  // that device; without one, clears every device for the user (logout-all).
  unregisterFcmToken = asyncHandler(async (req, res) => {
    const { fcmToken } = req.body || {};

    const where = fcmToken
      ? { userId: req.user.id, fcmToken }
      : { userId: req.user.id };

    await prisma.firebaseUser.deleteMany({ where });

    res.json({ success: true, data: { message: "FCM token unregistered" } });
  });

  // Richer device-registration variant. Stores fcmToken via FirebaseUser and
  // accepts metadata (platform, app version, device ids) so support &
  // analytics can identify a device without breaking the lighter
  // /fcm-token endpoint mobile already uses.
  registerDevice = asyncHandler(async (req, res) => {
    const { fcmToken, platform, appVersion, deviceId, deviceName } =
      req.body || {};
    if (!fcmToken) {
      throw new AppError("fcmToken is required", 400, "VALIDATION_ERROR");
    }
    const appContext = resolveDeviceAppContext(req);
    await prisma.firebaseUser.upsert({
      where: { userId_fcmToken: { userId: req.user.id, fcmToken } },
      create: {
        userId: req.user.id,
        fcmToken,
        appContext,
        fcmUsername: deviceName || platform || null,
        fcmUserId: deviceId || null,
        updatedAt: new Date(),
      },
      update: {
        deletedAt: null,
        appContext,
        fcmUsername: deviceName || platform || undefined,
        fcmUserId: deviceId || undefined,
        updatedAt: new Date(),
      },
    });
    res.json({
      success: true,
      data: { message: "Device registered", platform, appVersion },
    });
  });

  // Lightweight build/force-update gate consumed by mobile clients on
  // launch. Values come from env so ops can bump min/required versions
  // without a code change.
  appVersion = asyncHandler(async (req, res) => {
    const minVersion = process.env.MOBILE_MIN_VERSION || "1.0.0";
    const currentVersion = process.env.MOBILE_CURRENT_VERSION || "1.0.0";
    const platform = (req.query.platform || "").toString().toLowerCase();
    const cmp = (a, b) => {
      const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
      const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
      }
      return 0;
    };
    const clientVersion = (req.query.version || "0.0.0").toString();
    const updateRequired = cmp(clientVersion, minVersion) < 0;
    res.json({
      success: true,
      data: {
        minVersion,
        currentVersion,
        updateRequired,
        platform,
        updateUrl: {
          ios: process.env.MOBILE_IOS_URL || "",
          android: process.env.MOBILE_ANDROID_URL || "",
        },
      },
    });
  });

  getMobileEditorUrl = asyncHandler(async (req, res) => {
    const { flowId } = req.params;

    const flowData = await flowService.getFlowByIdWithAccess(
      flowId,
      req.user.id,
    );
    if (!flowData) {
      throw new AppError("Flow not found or access denied", 404, "NOT_FOUND");
    }

    const shortToken = jwt.sign(
      { id: req.user.id, flowId },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    res.json({
      success: true,
      data: {
        url: `${baseUrl}/mobile/editor/${flowId}?token=${shortToken}`,
        expiresIn: 3600,
      },
    });
  });
}

module.exports = new MobileAuthController();
