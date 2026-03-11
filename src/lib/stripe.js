const AppError = require('../utils/AppError');

/**
 * Returns a configured Stripe instance using the correct keys
 * based on STRIPE_MODE env var ('live' or 'test').
 *
 * Env vars:
 *   STRIPE_MODE: 'live' or 'test' (default: 'test')
 *   Test: STRIPE_SECRET_KEY
 *   Live: STRIPE_LIVE_SECRET_KEY
 *   Currency: STRIPE_CURRENCY (default: 'usd')
 */
function isLiveMode() {
    return process.env.STRIPE_MODE === 'live';
}

function getStripe() {
    const live = isLiveMode();
    const secretKey = live
        ? process.env.STRIPE_LIVE_SECRET_KEY
        : process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
        throw new AppError(
            `Stripe ${live ? 'live' : 'test'} secret key not configured`,
            503,
            'STRIPE_NOT_CONFIGURED'
        );
    }

    return require('stripe')(secretKey);
}

/**
 * Returns the Stripe currency from env (default: 'usd').
 */
function getStripeCurrency() {
    return (process.env.STRIPE_CURRENCY || 'usd').toLowerCase();
}

module.exports = { getStripe, getStripeCurrency, isLiveMode };
