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
      select: { id: true, refreshToken: true, userStatus: true },
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
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
      const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      email = payload.email;
      name = payload.name;
      image = payload.picture;
    } else if (provider === "apple") {
      const applePayload = await appleSignin.verifyIdToken(idToken, {
        audience: process.env.APPLE_CLIENT_ID,
        ignoreExpiration: false,
      });
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

  registerFcmToken = asyncHandler(async (req, res) => {
    const { fcmToken } = req.body;

    if (!fcmToken) {
      throw new AppError("fcmToken is required", 400, "VALIDATION_ERROR");
    }

    await prisma.firebaseUser.upsert({
      where: { userId: req.user.id },
      create: {
        userId: req.user.id,
        fcmToken,
        updatedAt: new Date(),
      },
      update: {
        fcmToken,
        updatedAt: new Date(),
      },
    });

    res.json({ success: true, data: { message: "FCM token registered" } });
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
