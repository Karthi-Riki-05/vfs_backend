const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return next(new AppError('Authorization header missing', 401, 'AUTH_HEADER_MISSING'));
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        return next(new AppError('Token not provided', 401, 'TOKEN_MISSING'));
    }

    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
        logger.error('NEXTAUTH_SECRET environment variable is not set');
        return next(new AppError('Server configuration error', 500, 'CONFIG_ERROR'));
    }

    try {
        const decoded = jwt.verify(token, secret);
        req.user = { id: decoded.sub, ...decoded };
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return next(new AppError('Token has expired', 401, 'TOKEN_EXPIRED'));
        }
        return next(new AppError('Invalid or expired token', 401, 'INVALID_TOKEN'));
    }
};

module.exports = { authenticate };
