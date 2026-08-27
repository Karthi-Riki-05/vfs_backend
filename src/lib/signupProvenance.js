/**
 * Signup provenance — resolve WHERE and HOW an account was first created.
 *
 * Single source of truth for the three write-once `User.first*` columns. Every
 * account-creation site funnels through here so the five of them cannot drift:
 *
 *   controllers/auth.controller.js       register  (email/password, web + WebView)
 *   controllers/auth.controller.js       oauthSync (web + WebView social)
 *   services/nativeAuth.service.js       resolveSocialUser (native Google/Facebook)
 *   controllers/mobile.auth.controller.js socialLogin (mobile JWT social)
 *   controllers/superAdmin.controller.js createUser (admin)
 *
 * ⚠️ SECURITY — the platform/app-type signal is the client's User-Agent, which
 * is fully client-controllable, exactly like `X-App-Source`. This is provenance
 * for support and analytics, and the precondition for a real store attestation
 * later. It is NEVER, on its own, evidence of purchase or grounds for an
 * entitlement — see the server-is-authoritative rule in docs/xc-security.md.
 *
 * WHY UA AND NOT A BODY FIELD
 *   A new body field would be a second spoofable channel to keep in sync across
 *   two Next.js route handlers, five controllers and their Zod schemas. The UA
 *   is the signal the rest of the stack already trusts for exactly this
 *   question (`mobileAppOnly`, `frontend/lib/detectWebView.ts`), so reusing it
 *   keeps ONE derivation rule instead of two that will disagree.
 *
 * HOW THE UA REACHES US ON THE WEB PATHS
 *   `register` and `oauth-sync` are called by the Next.js server, not the
 *   browser, so the client's UA does not arrive on its own. Both call sites
 *   forward it explicitly as `X-Client-User-Agent` (the real `User-Agent` on
 *   that hop belongs to axios). Absent header => "web", which is the correct
 *   and safe default: the website is the only caller that cannot be a shell.
 */

// Native-shell signatures. MUST stay in step with:
//   frontend/lib/detectWebView.ts       (PRO_UA_SIGNATURE / TEAM_UA_SIGNATURE)
//   flutter_webview-main/lib/webview_native.dart  (_appUserAgentTag)
const PRO_UA = /ValueChartsMobile\/Pro-App/i;
const TEAM_UA = /ValueChartsMobile\/Team-App/i;
const ANY_SHELL_UA = /ValueChartsMobile/i;
// Legacy tokens from shell builds predating ValueChartsMobile.
const LEGACY_SHELL_UA = /ValueChartApp|ValueChartProApp/;

/**
 * iOS detection inside the shell.
 *
 * ⚠️ Do NOT test for "Android" or "wv" here. The Android shell's UA is
 * `Mozilla/5.0 (Mobile) AppleWebKit/537.36 … Chrome/120.0.0.0 Mobile
 * Safari/537.36` — it contains NEITHER token, deliberately, because Google's
 * OAuth pages reject obviously-embedded WebView agents (see the long comment
 * on `_buildUserAgent` in webview_native.dart). The iOS shell, by contrast,
 * must claim iPhone/Safari or Apple's native Sign-in-with-Apple sheet handoff
 * breaks. So iOS is the positively-identifiable half and Android is the
 * remainder — not the other way round.
 *
 * This is also why `mobileAppOnly`'s rules 3 (`Android` + `wv`) and 4
 * (`iPhone` without `Safari`) never fire for the current shells; only the
 * `ValueChartsMobile` rule does.
 */
const IOS_UA = /iPhone|iPad|iPod/i;

const PLATFORM = { WEB: "web", ANDROID: "android", IOS: "ios", ADMIN: "admin" };
const APP_TYPE = { PRO: "pro", TEAM: "team", FREE: "free" };
const LOGIN_TYPE = {
  EMAIL: "email",
  GOOGLE: "google",
  FACEBOOK: "facebook",
  APPLE: "apple",
  LINKEDIN: "linkedin",
  ADMIN: "admin",
};

const VALID_PLATFORMS = new Set(Object.values(PLATFORM));
const VALID_APP_TYPES = new Set(Object.values(APP_TYPE));
const VALID_LOGIN_TYPES = new Set(Object.values(LOGIN_TYPE));

/** "pro" | "team" | null (null = not a shell UA). */
function shellAppTypeFromUserAgent(ua) {
  if (!ua) return null;
  if (PRO_UA.test(ua)) return APP_TYPE.PRO;
  if (TEAM_UA.test(ua)) return APP_TYPE.TEAM;
  // A legacy or unrecognised shell tag proves "a shell" but not which variant.
  // Treated as Pro only when the old Pro-specific token is present; a bare
  // ValueChartsMobile/ValueChartApp is genuinely ambiguous, so it stays null
  // and the caller's explicit `appVariant` (or "free") decides.
  if (/ValueChartProApp/.test(ua)) return APP_TYPE.PRO;
  return null;
}

/** "web" | "android" | "ios". */
function platformFromUserAgent(ua) {
  if (!ua) return PLATFORM.WEB;
  const isShell = ANY_SHELL_UA.test(ua) || LEGACY_SHELL_UA.test(ua);
  if (!isShell) return PLATFORM.WEB;
  return IOS_UA.test(ua) ? PLATFORM.IOS : PLATFORM.ANDROID;
}

/**
 * Resolve the provenance triple for a NEW account.
 *
 * @param {object}  opts
 * @param {string} [opts.userAgent]  the CLIENT's UA (see header note above)
 * @param {string} [opts.loginType]  how they signed up; required in practice
 * @param {string} [opts.platform]   explicit override — native/mobile endpoints
 *                                   know their platform for certain and do not
 *                                   need to guess from a UA
 * @param {string} [opts.appVariant] explicit override — the native endpoints
 *                                   already receive `appVariant` in the body
 * @returns {{firstPlatform: string, firstAppType: string, firstLoginType: string|null}}
 */
function resolveSignupProvenance(opts = {}) {
  const { userAgent, loginType, platform, appVariant } = opts;

  const firstPlatform = VALID_PLATFORMS.has(platform)
    ? platform
    : platformFromUserAgent(userAgent);

  // An explicit variant wins over the UA guess: a caller that KNOWS is always
  // better evidence than a regex. Fall back to the UA, then to "free" — a
  // website signup genuinely has no app.
  const firstAppType = VALID_APP_TYPES.has(appVariant)
    ? appVariant
    : shellAppTypeFromUserAgent(userAgent) || APP_TYPE.FREE;

  return {
    firstPlatform,
    firstAppType,
    firstLoginType: VALID_LOGIN_TYPES.has(loginType) ? loginType : null,
  };
}

/**
 * The client UA as forwarded by the Next.js server on the web auth paths.
 * Falls back to the request's own UA so a direct API caller (mobile shell
 * talking to the backend, curl, tests) still resolves correctly.
 */
function clientUserAgent(req) {
  return (
    req?.headers?.["x-client-user-agent"] || req?.headers?.["user-agent"] || ""
  );
}

module.exports = {
  resolveSignupProvenance,
  platformFromUserAgent,
  shellAppTypeFromUserAgent,
  clientUserAgent,
  PLATFORM,
  APP_TYPE,
  LOGIN_TYPE,
};
