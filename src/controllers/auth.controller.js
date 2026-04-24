const { prisma } = require("../lib/prisma");
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError("User already exists", 409, "USER_EXISTS");
  }

  const hashedPassword = await argon2.hash(password);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: "Viewer",
    },
  });

  logger.info(`User registered: ${user.id}`);

  res.status(201).json({
    success: true,
    data: {
      message: "User registered successfully",
      userId: user.id,
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
