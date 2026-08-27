const { OAuth2Client } = require("google-auth-library");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const {
  assertUserLoginable,
  resolveSocialUser,
  issueLoginTicket,
} = require("../services/nativeAuth.service");

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

/**
 * Audiences we accept on a native ID token.
 *
 * ⚠️ `GOOGLE_WEB_CLIENT_ID` IS THE ONE THAT MATTERS, and it is NOT the same as
 * this backend's `GOOGLE_CLIENT_ID`. Discovered 2026-08-25: the two halves of
 * this app were pointing at two different Google Cloud projects —
 *
 *   frontend/NextAuth  177678452616-…  (project value-charts-6b9c6, = Firebase)
 *   backend .env       298508684479-…  (a legacy project)
 *
 * The shell passes the WEB client as `serverClientId`, which makes the token's
 * `aud` that web client on both platforms. Verifying against the backend's own
 * `GOOGLE_CLIENT_ID` would therefore reject every native login with an opaque
 * "Invalid token".
 *
 * `GOOGLE_CLIENT_ID` stays in the list rather than being replaced: the legacy
 * project still backs `/api/v1/auth/mobile/social`. Accepting both is strictly
 * additive — each id is still an exact match against a client we own.
 *
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
    const { idToken, deviceId, appVariant, platform } = req.body || {};

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
    const user = await resolveSocialUser({
      provider: "google",
      email,
      name: payload.name,
      image: payload.picture,
      providerSub,
      tag: "native-google",
      // Signup provenance, used only if this creates the account. The
      // shell states its own platform: this endpoint is reached by a
      // plain Dart http call, so there is no shell User-Agent to read.
      platform,
      appVariant,
    });

    assertUserLoginable(user, "native-google");

    const ticket = await issueLoginTicket({
      userId: user.id,
      deviceId,
      source: "google",
    });

    logger.info(
      `[native-google] ticket issued: user=${user.id} variant=${
        appVariant === "pro" ? "pro" : "team"
      }`,
    );

    res.json({ success: true, data: ticket });
  });

}

module.exports = new NativeGoogleAuthController();
