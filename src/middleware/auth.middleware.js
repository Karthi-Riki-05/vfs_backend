const jwt = require("jsonwebtoken");
const { prisma } = require("../lib/prisma");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const { proContextViolation } = require("./enforceProContext");

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next(
      new AppError("Authorization header missing", 401, "AUTH_HEADER_MISSING"),
    );
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return next(new AppError("Token not provided", 401, "TOKEN_MISSING"));
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    logger.error("NEXTAUTH_SECRET environment variable is not set");
    return next(
      new AppError("Server configuration error", 500, "CONFIG_ERROR"),
    );
  }

  try {
    // Try NEXTAUTH_SECRET first (web tokens), fall back to JWT_SECRET (mobile tokens)
    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (primaryErr) {
      const mobileSecret = process.env.JWT_SECRET;
      if (!mobileSecret || primaryErr.name === "TokenExpiredError")
        throw primaryErr;
      decoded = jwt.verify(token, mobileSecret);
    }
    // Support both 'sub' (NextAuth tokens) and 'id' (proxy-signed tokens)
    const userId = decoded.sub || decoded.id;

    if (!userId) {
      return next(
        new AppError("Token missing user identifier", 401, "INVALID_TOKEN"),
      );
    }

    // Verify user still exists in database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        userStatus: true,
        currentVersion: true,
        suspendedAt: true,
        // Needed by the Pro app-context gate (enforceProContext) below.
        hasPro: true,
        proPurchasedAt: true,
      },
    });

    if (!user) {
      return next(
        new AppError(
          "User account not found. Please log out and log in again.",
          401,
          "USER_NOT_FOUND",
        ),
      );
    }

    if (user.userStatus === "deleted") {
      return next(
        new AppError(
          "User account has been deactivated",
          401,
          "USER_DEACTIVATED",
        ),
      );
    }

    // Rule #2 — suspended / inactive users cannot use the API
    if (user.suspendedAt !== null) {
      return next(new AppError("Account is inactive", 403, "ACCOUNT_INACTIVE"));
    }

    req.user = {
      id: userId,
      role: user.role,
      currentVersion: user.currentVersion || "free",
      hasPro: user.hasPro === true,
      proPurchasedAt: user.proPurchasedAt || null,
      ...decoded,
    };

    // Pro app-context gate: reject any request that claims the Pro context
    // (X-App-Context: pro / _appctx=pro) when the user is not entitled to Pro.
    // Runs here so every authenticated route is covered with no per-route
    // wiring. Provisioning/auth routes are exempt (see enforceProContext).
    const proViolation = proContextViolation(req);
    if (proViolation) return next(proViolation);

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(new AppError("Token has expired", 401, "TOKEN_EXPIRED"));
    }
    if (error instanceof AppError) {
      return next(error);
    }
    return next(new AppError("Invalid or expired token", 401, "INVALID_TOKEN"));
  }
};

module.exports = { authenticate };
