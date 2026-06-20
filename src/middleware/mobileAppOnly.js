const AppError = require("../utils/AppError");

/**
 * mobileAppOnly middleware
 *
 * Restricts an endpoint to ValueChart Flutter WebView (mobile-app) requests.
 * The Flutter shell injects an `X-App-Source` header (forwarded verbatim by the
 * Next.js proxy) and runs inside an in-app WebView whose user-agent differs
 * from a normal browser. Gating the free Pro-grant endpoint here stops the
 * website from abusing it (the App Store / Play Store already collected payment
 * for mobile users).
 *
 * Allowed when ANY mobile indicator is present:
 *   1. X-App-Source is one of the known mobile-app values
 *   2. A ValueChart app user-agent token — the canonical `ValueChartsMobile`
 *      signature (Pro and Team shells) or the legacy `ValueChart(Pro)App` tags
 *   3. Android in-app WebView UA (`Android` + `wv`)
 *   4. iOS WKWebView UA (`iPhone` without the `Safari` token)
 *
 * NOTE: `X-App-Source` is set client-side and is therefore a soft signal, not a
 * cryptographic guarantee. It is sufficient to keep casual web traffic out; a
 * hardened version would verify a Flutter-signed token. See Phase-B notes.
 */
const MOBILE_APP_SOURCES = new Set([
  "mobile",
  "pro-mobile-app",
  "team-mobile-app",
]);

module.exports = function mobileAppOnly(req, res, next) {
  const appSource = req.headers["x-app-source"];
  const userAgent = req.headers["user-agent"] || "";

  const isMobile =
    MOBILE_APP_SOURCES.has(appSource) ||
    // Canonical signature stamped by the current Flutter shells (Pro + Team):
    //   ValueChartsMobile/Pro-App | ValueChartsMobile/Team-App
    userAgent.includes("ValueChartsMobile") ||
    // Legacy native tokens from older shell builds (pre-ValueChartsMobile).
    userAgent.includes("ValueChartApp") ||
    userAgent.includes("ValueChartProApp") ||
    // Android in-app WebView pattern
    (userAgent.includes("Android") && userAgent.includes("wv")) ||
    // iOS WKWebView pattern
    (userAgent.includes("iPhone") && !userAgent.includes("Safari"));

  if (!isMobile) {
    return next(
      new AppError(
        "This endpoint is only available from the ValueChart mobile app.",
        403,
        "MOBILE_ONLY",
      ),
    );
  }

  next();
};
