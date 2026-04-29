const { prisma } = require("../lib/prisma");
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const { sendVerificationEmail } = require("../utils/email");

const VERIFY_OTP_TTL_MIN = 15;

function generateOtp() {
  // 6-digit numeric OTP using crypto for unbiased range
  const num = crypto.randomInt(0, 1000000);
  return {
    otp: String(num).padStart(6, "0"),
    expiresAt: new Date(Date.now() + VERIFY_OTP_TTL_MIN * 60 * 1000),
  };
}

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError("User already exists", 409, "USER_EXISTS");
  }

  const hashedPassword = await argon2.hash(password);
  const { otp, expiresAt } = generateOtp();

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: "Viewer",
      verifyToken: otp,
      verifyTokenExpiresAt: expiresAt,
    },
  });

  logger.info(`User registered (pending OTP verification): ${user.id}`);

  try {
    await sendVerificationEmail({ to: email, name, otp });
  } catch (err) {
    logger.error(`Verification email failed for ${email}: ${err.message}`);
  }

  res.status(201).json({
    success: true,
    data: {
      message:
        "Registration successful. Please check your email for a 6-digit verification code.",
      email,
    },
  });
});

exports.verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new AppError("Invalid code", 400, "INVALID_OTP");
  }

  if (user.emailVerified) {
    throw new AppError("Email already verified", 400, "ALREADY_VERIFIED");
  }

  if (!user.verifyToken || user.verifyToken !== otp) {
    throw new AppError("Invalid code", 400, "INVALID_OTP");
  }

  if (
    !user.verifyTokenExpiresAt ||
    user.verifyTokenExpiresAt.getTime() < Date.now()
  ) {
    throw new AppError(
      "Code expired. Please request a new one.",
      400,
      "OTP_EXPIRED",
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: new Date(),
      verifyToken: null,
      verifyTokenExpiresAt: null,
    },
  });

  logger.info(`Email verified via OTP: ${user.id}`);
  res.json({
    success: true,
    data: { message: "Email verified successfully" },
  });
});

exports.resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });

  // Always respond success to avoid email enumeration
  if (!user || user.emailVerified) {
    return res.json({
      success: true,
      data: {
        message: "If your account exists and is unverified, a code was sent.",
      },
    });
  }

  const { otp, expiresAt } = generateOtp();
  await prisma.user.update({
    where: { id: user.id },
    data: { verifyToken: otp, verifyTokenExpiresAt: expiresAt },
  });

  try {
    await sendVerificationEmail({ to: user.email, name: user.name, otp });
  } catch (err) {
    logger.error(`Verification email failed for ${email}: ${err.message}`);
  }

  res.json({
    success: true,
    data: {
      message: "If your account exists and is unverified, a code was sent.",
    },
  });
});

exports.oauthSync = asyncHandler(async (req, res) => {
  const { email, name, image, provider } = req.body;

  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        name: name || email.split("@")[0],
        email,
        image: image || null,
        role: "Viewer",
      },
    });
    logger.info(`OAuth user created via ${provider}: ${user.id}`);
  } else {
    // Update image/name if not set
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

  res.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      hasPro: user.hasPro,
      currentVersion: user.currentVersion,
    },
  });
});

exports.validateUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !user.password) {
    throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
  }

  const isValid = await argon2.verify(user.password, password);

  if (!isValid) {
    logger.warn(`Failed login attempt for: ${email}`);
    throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
  }

  // Rule #2 — inactive / suspended users cannot log in
  if (user.userStatus === "deleted") {
    throw new AppError("Account is inactive", 403, "ACCOUNT_INACTIVE");
  }
  if (user.suspendedAt !== null) {
    logger.warn(`Login blocked — account suspended: ${user.id}`);
    throw new AppError("Account is inactive", 403, "ACCOUNT_INACTIVE");
  }
  if (!user.emailVerified) {
    logger.warn(`Login blocked — email not verified: ${user.id}`);
    throw new AppError(
      "Please verify your email before logging in. Check your inbox for the confirmation link.",
      403,
      "EMAIL_NOT_VERIFIED",
    );
  }

  logger.info(`User authenticated: ${user.id}`);

  const token = jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    process.env.NEXTAUTH_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
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
      token,
    },
  });
});
