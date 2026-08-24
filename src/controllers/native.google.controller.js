const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const { prisma } = require("../lib/prisma");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

/**
 * Native Google Sign-In for the shell.
 *
 * WHY THIS EXISTS SEPARATELY
 *   Google refuses OAuth inside an embedded WebView (`disallowed_useragent`),
 *   so the web app's NextAuth GoogleProvider cannot run in the app — which is
 *   why LoginForm ships a "open this in Chrome" banner. The shell instead asks
 *   the OS for an ID token (Credential Manager on Android, the Google SDK on
 *   iOS), which is where the familiar account-picker sheet comes from.
 *
 *   That leaves the same seam biometric login had: the phone holds a Google ID
 *   token, but the WebView's session is a NextAuth cookie. So this endpoint
 *   does exactly what biometric `exchange` does — verifies the credential and
 *   hands back a ~60-second one-time ticket. The shell then loads
 *   `/native?ott=…`, and the existing `biometric` CredentialsProvider redeems
 *   it server-to-server so NextAuth mints the cookie through its normal path.
 *   Nothing is forged, and the ID token never reaches the page.
 *
 *   The ticket rides the shared `biometric_otts` table on purpose: `consume` is
 *   already source-agnostic (it needs a userId and a deviceId, nothing more),
 *   and a second table would duplicate the atomic-claim logic that makes the
 *   handoff safe. The `deviceId` recorded here is prefixed `google:` so the two
 *   sources stay distinguishable in logs and in any later audit.
 *
 * WHY NOT REUSE /api/v1/auth/mobile/social
 *   That endpoint verifies the very same ID token but answers with bearer
 *   JWTs, for a native-login app. The WebView cannot use a bearer token — see
 *   docs/be-auth-biometric.md for the full argument.
 */

/** Lifetime of the hand-off ticket. Matches the biometric one deliberately. */
const OTT_TTL_SECONDS = Number(process.env.BIOMETRIC_OTT_TTL_SECONDS || 60);

function mintToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Audiences we accept on a native ID token.
 *
 * ⚠️ `GOOGLE_WEB_CLIENT_ID` IS THE ONE THAT MATTERS, and it is NOT the same as
 * this backend's `GOOGLE_CLIENT_ID`. Discovered 2026-08-24: the two halves of
 * this app were pointing at two different Google Cloud projects —
 *
 *   frontend/NextAuth  177678452616-…  (project value-charts-6b9c6, = Firebase)
 *   backend .env       298508684479-…  (a legacy project, redirect
 *                                       apps.valueflowsoft.com/login/handler)
 *
 * The shell passes the WEB client as `serverClientId`, which is Google's own
 * recommendation and makes the token's `aud` that web client on both
 * platforms. Verifying against the backend's own `GOOGLE_CLIENT_ID` would
 * therefore reject every native login with an opaque "Invalid token".
 *
 * `GOOGLE_CLIENT_ID` stays in the list rather than being replaced: the legacy
 * project still backs `/api/v1/auth/mobile/social`, and dropping it would break
 * whatever still calls that. Accepting both is strictly additive — each id is
 * still an exact match against a client we own.
 *
 * The per-platform ids are a fallback for builds where `serverClientId` was not
 * wired up, because the alternative is a login that fails with no clue why.
 * All are OPTIONAL: an unset one is filtered out rather than becoming an
 * empty-string audience, which would match nothing and mask the real cause.
 */
function acceptedAudiences() {
  return [
    process.env.GOOGLE_WEB_CLIENT_ID,
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
  ].filter((id) => typeof id === "string" && id.length > 0);
}

/** Same gate as biometric/login/refresh — see BUG-007 parity. */
function assertUserLoginable(user) {
  if (!user) {
    throw new AppError("Invalid or expired token", 401, "INVALID_TOKEN");
  }
  if (user.userStatus === "deleted") {
    throw new AppError("Account has been deactivated", 401, "USER_DEACTIVATED");
  }
  if (user.suspendedAt !== null && user.suspendedAt !== undefined) {
    logger.warn(`[native-google] blocked — suspended: ${user.id}`);
    throw new AppError("Account is inactive", 401, "ACCOUNT_INACTIVE");
  }
}

class NativeGoogleAuthController {
  /**
   * POST /api/v1/auth/native/google   (open, rate-limited)
   *
   * Body: `{ idToken, deviceId?, appVariant? }`
   * Returns: `{ success: true, data: { ott, expiresIn } }`
   *
   * Deliberately unauthenticated — it runs BEFORE any session exists. The ID
   * token IS the credential: Google signed it, we verify that signature, and
   * we check the audience so a token minted for someone else's app is refused.
   */
  login = asyncHandler(async (req, res) => {
    const { idToken, deviceId, appVariant } = req.body || {};

    if (!idToken || typeof idToken !== "string") {
      throw new AppError("idToken is required", 400, "VALIDATION_ERROR");
    }

    const audience = acceptedAudiences();
    if (audience.length === 0) {
      // Misconfiguration, not a user error. Fail loudly in the log and give the
      // shell a 500 rather than a 401 it would read as "wrong account".
      logger.error(
        "[native-google] no Google client id configured (set " +
          "GOOGLE_WEB_CLIENT_ID) — cannot verify ID tokens",
      );
      throw new AppError(
        "Google sign-in is not configured",
        500,
        "GOOGLE_NOT_CONFIGURED",
      );
    }

    let payload;
    try {
      const client = new OAuth2Client();
      const ticket = await client.verifyIdToken({ idToken, audience });
      payload = ticket.getPayload();
    } catch (err) {
      logger.warn(`[native-google] idToken verify failed: ${err.message}`);
      throw new AppError("Invalid or expired token", 401, "INVALID_TOKEN");
    }

    // Google asserts whether it has verified the address. An unverified one
    // must never be used as an identity key — that is an account-takeover
    // vector (bug-006), and mobile.auth.controller.js guards it identically.
    if (payload.email_verified !== true) {
      throw new AppError(
        "Email not verified by provider",
        401,
        "SOCIAL_EMAIL_NOT_VERIFIED",
      );
    }

    const email = payload.email;
    if (!email) {
      throw new AppError(
        "Could not retrieve email from Google token",
        400,
        "SOCIAL_NO_EMAIL",
      );
    }

    const providerSub = payload.sub ? String(payload.sub) : null;
    const user = await this.#resolveUser({
      email,
      name: payload.name,
      image: payload.picture,
      providerSub,
    });

    assertUserLoginable(user);

    // Prefix so a `biometric_otts` row's origin is legible without a join.
    const ticketDeviceId = `google:${
      typeof deviceId === "string" && deviceId.length > 0
        ? deviceId.slice(0, 120)
        : "unknown"
    }`;

    const ott = mintToken();
    await prisma.biometricOtt.create({
      data: {
        tokenHash: hashToken(ott),
        userId: user.id,
        deviceId: ticketDeviceId,
        expiresAt: new Date(Date.now() + OTT_TTL_SECONDS * 1000),
      },
    });

    logger.info(
      `[native-google] ticket issued: user=${user.id} variant=${
        appVariant === "pro" ? "pro" : "team"
      }`,
    );

    res.json({ success: true, data: { ott, expiresIn: OTT_TTL_SECONDS } });
  });

  /**
   * Find or create the account behind a verified Google identity.
   *
   * Mirrors mobile.auth.controller.js#socialLogin, including the subject-id
   * fallback: an account imported from the old app may carry a fabricated
   * address, so a miss on email is not proof this is a new person.
   */
  async #resolveUser({ email, name, image, providerSub }) {
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user && providerSub) {
      const link = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: providerSub,
          },
        },
        include: { user: true },
      });
      user = link?.user || null;
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: name || email.split("@")[0],
          image: image || null,
          role: "Viewer",
          // Google has verified the address, so the account starts verified —
          // consistent with the credentials gate and with socialLogin.
          emailVerified: new Date(),
        },
      });
      logger.info(`[native-google] user created: ${user.id}`);
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

    // Keep the account reachable by subject id even if Google later stops
    // sharing the address. Parity with the web oauthSync path.
    if (providerSub) {
      try {
        await prisma.account.upsert({
          where: {
            provider_providerAccountId: {
              provider: "google",
              providerAccountId: providerSub,
            },
          },
          create: {
            userId: user.id,
            type: "oauth",
            provider: "google",
            providerAccountId: providerSub,
          },
          update: { userId: user.id },
        });
      } catch (err) {
        // Non-fatal: the identity is already established.
        logger.warn(`[native-google] account link upsert failed: ${err.message}`);
      }
    }

    return user;
  }
}

module.exports = new NativeGoogleAuthController();
