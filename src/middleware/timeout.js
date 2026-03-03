const AppError = require('../utils/AppError');

const timeout = (ms = 30000) => (req, res, next) => {
    const timer = setTimeout(() => {
        if (!res.headersSent) {
            next(new AppError('Request timeout', 408, 'REQUEST_TIMEOUT'));
        }
    }, ms);

    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    next();
};

module.exports = timeout;
