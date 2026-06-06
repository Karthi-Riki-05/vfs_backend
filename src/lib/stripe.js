const AppError = require("../utils/AppError");

/**
 * Returns a configured Stripe instance using the correct keys
 * based on STRIPE_MODE env var ('live' or 'test').
 *
 * Env vars:
 *   STRIPE_MODE: 'live' or 'test' (default: 'test')
 *   Test: STRIPE_TEST_SECRET_KEY or STRIPE_SECRET_KEY (legacy)
 *   Live: STRIPE_LIVE_SECRET_KEY
 *   Currency: STRIPE_CURRENCY (default: 'usd')
 */
function isLiveMode() {
  return process.env.STRIPE_MODE === "live";
}

function getStripe() {
  const live = isLiveMode();
  const secretKey = live
    ? process.env.STRIPE_LIVE_SECRET_KEY
    : process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new AppError(
      `Stripe ${live ? "live" : "test"} secret key not configured`,
      503,
      "STRIPE_NOT_CONFIGURED",
    );
  }

  return require("stripe")(secretKey);
}

/**
 * Returns the Stripe currency from env (default: 'usd').
 */
function getStripeCurrency() {
  return (process.env.STRIPE_CURRENCY || "usd").toLowerCase();
}

/**
 * Returns the correct Stripe Price ID based on current mode.
 * Checks the mode-specific var first, then falls back to the legacy var.
 *
 * @param {string|null} testVar  - Env var name for test mode (e.g. 'STRIPE_TEST_TEAM_MONTHLY_PRICE')
 * @param {string|null} liveVar  - Env var name for live mode (e.g. 'STRIPE_LIVE_TEAM_MONTHLY_PRICE')
 * @param {string|null} legacyVar - Optional legacy fallback (e.g. 'STRIPE_TEAM_MONTHLY_PRICE')
 * @returns {string|null}
 */
function getStripePrice(testVar, liveVar, legacyVar = null) {
  const live = isLiveMode();
  const primaryVar = live ? liveVar : testVar;
  if (primaryVar) {
    const v = process.env[primaryVar];
    if (v && v !== "placeholder") return v;
  }
  if (legacyVar) {
    const v = process.env[legacyVar];
    if (v && v !== "placeholder") return v;
  }
  return null;
}

/**
 * Returns the Stripe webhook signing secret for the current mode.
 * Stripe issues a separate signing secret per endpoint per mode.
 *
 * Precedence (test mode):  STRIPE_TEST_WEBHOOK_SECRET → STRIPE_WEBHOOK_SECRET
 * Precedence (live mode):  STRIPE_LIVE_WEBHOOK_SECRET → STRIPE_WEBHOOK_SECRET
 *
 * @returns {string|null}
 */
function getStripeWebhookSecret() {
  const live = isLiveMode();
  const modeVar = live
    ? "STRIPE_LIVE_WEBHOOK_SECRET"
    : "STRIPE_TEST_WEBHOOK_SECRET";
  const modeSecret = process.env[modeVar];
  if (modeSecret && modeSecret !== "placeholder") return modeSecret;
  return process.env.STRIPE_WEBHOOK_SECRET || null;
}

module.exports = {
  getStripe,
  getStripeCurrency,
  isLiveMode,
  getStripePrice,
  getStripeWebhookSecret,
};
