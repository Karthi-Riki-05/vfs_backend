const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const {
  assertUserLoginable,
  resolveSocialUser,
  issueLoginTicket,
} = require("../services/nativeAuth.service");

/**
 * Native Facebook Sign-In for the shell.
 *
 * WHY THIS EXISTS
 *   Facebook refuses OAuth inside an embedded WebView exactly as Google does —
 *   tapping the Facebook pill in the app renders "Facebook is not available on
 *   this browser" (confirmed on device 2026-08-25), so Facebook login has never
 *   worked in either app. The shell therefore asks the OS instead, and this
 *   endpoint turns the resulting access token into the same short-lived ticket
 *   the Google and biometric paths use. See docs/be-auth-native-google.md for
 *   the shared hand-off, and nativeAuth.service.js for the shared half.
 *
 * HOW VERIFICATION DIFFERS FROM GOOGLE
 *   Google issues a SIGNED ID token that can be verified offline against
 *   Google's public keys. Facebook issues an opaque access token that carries
 *   no signature, so the only way to trust it is to ASK Facebook — two calls,
 *   both server-to-server:
 *
 *     1. /debug_token  — is this token valid, and WHICH APP was it minted for?
 *     2. /me           — the profile behind it.
 *
 *   Step 1 is the security-critical one. Without the `app_id` check, a token
 *   minted for ANY other Facebook app would be accepted here, letting anyone
 *   with their own Facebook app sign in as any of our users. Facebook's own
 *   docs call this out; it is the Facebook equivalent of Google's `audience`.
 */

const GRAPH = "https://graph.facebook.com/v19.0";

/**
 * Graph GET with a hard timeout.
 *
 * Global `fetch` (Node 18) rather than a client library — matches
 * applestore.service.js and googleplay.service.js, and this backend carries no
 * HTTP dependency. The timeout matters: without one, a Graph outage would hang
 * a login request until the proxy gave up.
 */
async function graphGet(path, params) {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      // Surface Facebook's own message into our log, never to the caller.
      const detail = body?.error?.message || `HTTP ${res.status}`;
      throw new Error(detail);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

class NativeFacebookAuthController {
  /**
   * POST /api/v1/auth/native/facebook   (open, rate-limited)
   *
   * Body: `{ accessToken, deviceId?, appVariant? }`
   * Returns: `{ success: true, data: { ott, expiresIn } }`
   *
   * Deliberately unauthenticated — it runs before any session exists. The
   * Facebook-issued access token is the credential, and it is only trusted
   * after Facebook itself confirms both its validity and its audience.
   */
  login = asyncHandler(async (req, res) => {
    const { accessToken, deviceId, appVariant, platform } = req.body || {};

    if (!accessToken || typeof accessToken !== "string") {
      throw new AppError("accessToken is required", 400, "VALIDATION_ERROR");
    }

    const appId = process.env.FACEBOOK_CLIENT_ID;
    const appSecret = process.env.FACEBOOK_CLIENT_SECRET;
    if (!appId || !appSecret) {
      // Misconfiguration, not a user error. Fail loudly in the log and answer
      // 500 rather than a 401 the app would show as "wrong account".
      logger.error(
        "[native-facebook] FACEBOOK_CLIENT_ID / FACEBOOK_CLIENT_SECRET not set",
      );
      throw new AppError(
        "Facebook sign-in is not configured",
        500,
        "FACEBOOK_NOT_CONFIGURED",
      );
    }

    // ── 1. Is the token real, and is it OURS? ────────────────────────────
    let debug;
    try {
      const body = await graphGet("/debug_token", {
        input_token: accessToken,
        // App-secret proof, NOT the user's token: asking Facebook to inspect a
        // token must be authenticated as the app, or anyone could probe it.
        access_token: `${appId}|${appSecret}`,
      });
      debug = body?.data;
    } catch (err) {
      logger.warn(`[native-facebook] debug_token failed: ${err.message}`);
      throw new AppError("Invalid or expired token", 401, "INVALID_TOKEN");
    }

    if (!debug?.is_valid) {
      throw new AppError("Invalid or expired token", 401, "INVALID_TOKEN");
    }

    // THE audience check. A token minted for someone else's Facebook app is
    // perfectly "valid" — it is just not valid *for us*.
    if (String(debug.app_id) !== String(appId)) {
      logger.warn(
        `[native-facebook] token minted for app ${debug.app_id}, expected ${appId}`,
      );
      throw new AppError("Invalid or expired token", 401, "INVALID_TOKEN");
    }

    const providerSub = debug.user_id ? String(debug.user_id) : null;

    // ── 2. Who is it? ────────────────────────────────────────────────────
    let profile;
    try {
      profile = await graphGet("/me", {
        fields: "id,name,email",
        access_token: accessToken,
      });
    } catch (err) {
      logger.warn(`[native-facebook] /me failed: ${err.message}`);
      throw new AppError("Invalid or expired token", 401, "INVALID_TOKEN");
    }

    const email = profile?.email;
    if (!email) {
      // Facebook does NOT guarantee an email: accounts registered with a phone
      // number, and users who decline the email permission, yield a valid
      // token with no address. Refusing matches what socialLogin already does
      // for Apple's hidden-email case rather than inventing a second rule —
      // an account with no address cannot be reconciled with the web login,
      // password reset, or team invitations, all of which are email-keyed.
      logger.warn(`[native-facebook] no email on fb user ${providerSub}`);
      throw new AppError(
        "Your Facebook account has no shared email address. Use email sign-in instead.",
        400,
        "SOCIAL_NO_EMAIL",
      );
    }

    const user = await resolveSocialUser({
      provider: "facebook",
      email,
      name: profile.name,
      // Facebook's picture endpoint needs a separate call and returns a
      // short-lived CDN URL, so no image is stored. The user can set one.
      image: null,
      providerSub,
      tag: "native-facebook",
      // Signup provenance, used only if this creates the account. The
      // shell states its own platform: this endpoint is reached by a
      // plain Dart http call, so there is no shell User-Agent to read.
      platform,
      appVariant,
    });

    assertUserLoginable(user, "native-facebook");

    const ticket = await issueLoginTicket({
      userId: user.id,
      deviceId,
      source: "facebook",
    });

    logger.info(
      `[native-facebook] ticket issued: user=${user.id} variant=${
        appVariant === "pro" ? "pro" : "team"
      }`,
    );

    res.json({ success: true, data: ticket });
  });
}

module.exports = new NativeFacebookAuthController();
