const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later.' },
    },
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: { code: 'AUTH_RATE_LIMIT', message: 'Too many authentication attempts, please try again later.' },
    },
});

const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: { code: 'AI_RATE_LIMIT', message: 'Too many AI requests, please try again later.' },
    },
});

module.exports = { globalLimiter, authLimiter, aiLimiter };
