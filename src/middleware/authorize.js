const AppError = require('../utils/AppError');

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
        }
        if (roles.length > 0 && !roles.includes(req.user.role)) {
            return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
        }
        next();
    };
};

module.exports = authorize;
