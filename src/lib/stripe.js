const AppError = require('../utils/AppError');

/**
 * Returns a configured Stripe instance using the correct keys
 * based on environment (test vs live).
 *
 * Uses live keys when NODE_ENV=production, test keys otherwise.
 * Env vars:
 *   Test: STRIPE_SECRET_KEY
 *   Live: STRIPE_LIVE_SECRET_KEY
 *   Currency: STRIPE_CURRENCY (default: 'usd')
 */
function getStripe() {
    const isLive = process.env.NODE_ENV === 'production';
    const secretKey = isLive
        ? process.env.STRIPE_LIVE_SECRET_KEY
        : process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
        throw new AppError(
            `Stripe ${isLive ? 'live' : 'test'} secret key not configured`,
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

module.exports = { getStripe, getStripeCurrency };
