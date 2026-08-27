const { prisma } = require("../lib/prisma");
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const { sendVerificationEmail } = require("../utils/email");
const securityAlert = require("../services/securityAlert.service");
const { verifyUserPassword } = require("../utils/verifyUserPassword");
const userService = require("../services/user.service");
const {
  resolveSignupProvenance,
  clientUserAgent,
  LOGIN_TYPE,
} = require("../lib/signupProvenance");

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

  // Write-once signup provenance. The client UA arrives as X-Client-User-Agent
  // because this endpoint is called by the Next.js server, not the browser —
  // see lib/signupProvenance.js. Absent header => "web", the safe default.
  const provenance = resolveSignupProvenance({
    userAgent: clientUserAgent(req),
    loginType: LOGIN_TYPE.EMAIL,
  });

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: "Viewer",
      verifyToken: otp,
      verifyTokenExpiresAt: expiresAt,
      ...provenance,
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
      userId: user.id,
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
  const {
    email,
    name,
    image,
    provider,
    providerAccountId,
    accountType,
    emailVerified: providerVerifiedEmail,
  } = req.body;

  // bug-082 — identity resolution. An email the provider has NOT vouched for is
  // not an identity key: matching on it lets a provider account carrying someone
  // else's address resolve to their row (the mobile twin rejects this outright —
  // see socialLogin / bug-006). Verified => match by email as before. Unverified
  // => match ONLY an Account link already established for this provider identity.
  const linkKey =
    provider && providerAccountId
      ? { provider, providerAccountId: String(providerAccountId) }
      : null;

  let user = null;
  if (providerVerifiedEmail) {
    user = await prisma.user.findUnique({ where: { email } });
  }

  // Verified email did not match (or was not vouched for): fall back to the
  // provider's OWN subject id. This does not loosen bug-082 — that rule is
  // "never treat an UNVOUCHED EMAIL as an identity key", and `(provider,
  // providerAccountId)` is the provider's signed subject, which is strictly
  // stronger evidence than any address.
  //
  // Without this, 761 accounts imported from the old app were unreachable: it
  // stored `<apple_sub>@valueflowsoft.com` (or a bare provider id) whenever the
  // provider hid the real address, so Apple/Facebook return an address that
  // matches nothing and the user silently gets a NEW empty account — orphaning
  // 528 flows and 38 paid subscriptions.
  if (!user && linkKey) {
    const link = await prisma.account.findUnique({
      where: { provider_providerAccountId: linkKey },
      include: { user: true },
    });
    user = link?.user || null;
  }

  if (!user) {
    // Unverified and unlinked: if the address already belongs to someone, stop —
    // never adopt their row, never create a duplicate.
    if (!providerVerifiedEmail) {
      const taken = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (taken) {
        logger.warn(
          `OAuth sync blocked — ${provider} did not verify ${email}, which already belongs to ${taken.id}`,
        );
        throw new AppError(
          "This email is already registered and your provider did not verify it. Sign in with your password, or reset it to regain access.",
          403,
          "SOCIAL_EMAIL_NOT_VERIFIED",
        );
      }
    }

    user = await prisma.user.create({
      data: {
        name: name || email.split("@")[0],
        email,
        image: image || null,
        role: "Viewer",
        // Only a provider-vouched email counts as verified; otherwise the row
        // stays subject to the OTP gate like any credentials registration.
        emailVerified: providerVerifiedEmail ? new Date() : null,
        // Write-once signup provenance. `provider` is NextAuth's own id
        // ("google" | "facebook" | "apple" | "linkedin"); an unrecognised one
        // records null rather than a guess.
        ...resolveSignupProvenance({
          userAgent: clientUserAgent(req),
          loginType: String(provider || "").toLowerCase(),
        }),
      },
    });
    logger.info(`OAuth user created via ${provider}: ${user.id}`);
  } else {
    // Rule #2 parity with validateUser / protect / mobile socialLogin: an
    // inactive account must not complete sign-in (bug-082).
    if (user.userStatus === "deleted") {
      throw new AppError(
        "User account has been deactivated",
        401,
        "USER_DEACTIVATED",
      );
    }
    if (user.suspendedAt !== null) {
      logger.warn(`OAuth sign-in blocked — account suspended: ${user.id}`);
      throw new AppError("Account is inactive", 403, "ACCOUNT_INACTIVE");
    }

    // Super-admins must never use the OAuth path. Enforced here, before any
    // write, because the frontend signIn check is UX only (server authoritative).
    if (user.role === "super_admin") {
      logger.warn(`OAuth sign-in blocked — super_admin: ${user.id}`);
      throw new AppError(
        "This account cannot sign in with a social provider",
        403,
        "OAUTH_NOT_ALLOWED",
      );
    }

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

  // Persist the OAuth account link so the super-admin Login Type column
  // can show "Google" / "LinkedIn" etc. The Account table is otherwise
  // never written because we use JWT strategy (no PrismaAdapter).
  if (provider && providerAccountId) {
    await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId: String(providerAccountId),
        },
      },
      create: {
        userId: user.id,
        type: accountType || "oauth",
        provider,
        providerAccountId: String(providerAccountId),
      },
      update: {
        userId: user.id,
        type: accountType || "oauth",
      },
    });
  }

  // Mirror validateUser: OAuth users with an active team subscription must get
  // team access immediately, not only after a session refresh. See bug-004.
  const hasTeamAccess = await userService.getHasTeamAccess(user.id);

  // bug-083: return only what the NextAuth `signIn`/`jwt` callbacks consume.
  // `email`/`name` are dropped — the caller already has them from the provider,
  // and echoing profile data back widens the blast radius of any future leak.
  res.json({
    success: true,
    data: {
      id: user.id,
      role: user.role,
      hasPro: user.hasPro,
      currentVersion: user.currentVersion,
      hasTeamAccess,
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

  // Legacy-bcrypt handling and the argon2 upgrade live in one shared helper so
  // no call site can forget the branch — which is what silently broke mobile
  // login, change-password and delete-account for every imported account.
  const isValid = await verifyUserPassword(user, password);

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
      "Please verify your email before logging in. Check your inbox for the 6-digit verification code.",
      403,
      "EMAIL_NOT_VERIFIED",
    );
  }

  logger.info(`User authenticated: ${user.id}`);

  // Security hygiene: record the device and alert on a new device/IP.
  // Fire-and-forget — must never delay or fail the login response.
  securityAlert.checkLoginDevice({
    userId: user.id,
    email: user.email,
    name: user.name,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  const token = jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    process.env.NEXTAUTH_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
  );

  const hasTeamAccess = await userService.getHasTeamAccess(user.id);

  // bug-152: stamp lastSeen on successful sign-in. It was previously written
  // only by the websocket DISCONNECT handler, so anyone who never opened a
  // realtime session never got one — 3 rows out of 10,163 had a value. That
  // left the super-admin console's "Last Login" column, the user record's
  // "Last Seen" field and the dashboard's "Active (24h)" KPI permanently
  // blank. Fire-and-forget: a metrics write must never fail a login.
  void (async () => {
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastSeen: new Date() },
      });
    } catch (err) {
      logger.warn(`[Auth] lastSeen update failed: ${err.message}`);
    }
  })();

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
