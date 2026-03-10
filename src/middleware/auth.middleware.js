const jwt = require('jsonwebtoken');
const { prisma } = require('../lib/prisma');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const authenticate = async (req, res, next) => {
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
        // Support both 'sub' (NextAuth tokens) and 'id' (proxy-signed tokens)
        const userId = decoded.sub || decoded.id;

        if (!userId) {
            return next(new AppError('Token missing user identifier', 401, 'INVALID_TOKEN'));
        }

        // Verify user still exists in database
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, role: true, userStatus: true, currentVersion: true },
        });

        if (!user) {
            return next(new AppError('User account not found. Please log out and log in again.', 401, 'USER_NOT_FOUND'));
        }

        if (user.userStatus === 'deleted') {
            return next(new AppError('User account has been deactivated', 401, 'USER_DEACTIVATED'));
        }

        req.user = { id: userId, role: user.role, currentVersion: user.currentVersion || 'free', ...decoded };
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return next(new AppError('Token has expired', 401, 'TOKEN_EXPIRED'));
        }
        if (error instanceof AppError) {
            return next(error);
        }
        return next(new AppError('Invalid or expired token', 401, 'INVALID_TOKEN'));
    }
};

module.exports = { authenticate };
