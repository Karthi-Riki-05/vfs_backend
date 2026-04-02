const AppError = require('../utils/AppError');

// Role hierarchy: higher index = more permissions
const ROLE_HIERARCHY = {
    'Free User': 0,
    'Viewer': 1,
    'User': 2,
    'Process Manager': 3,
    'Editor': 4,
    'Company Admin': 5,
    'Admin': 6,
    'Super Admin': 7,
};

const ADMIN_ROLES = ['Admin', 'Super Admin', 'Company Admin'];

function getRoleLevel(role) {
    return ROLE_HIERARCHY[role] ?? 0;
}

function hasMinRole(userRole, requiredRole) {
    return getRoleLevel(userRole) >= getRoleLevel(requiredRole);
}

function isAdmin(role) {
    return ADMIN_ROLES.includes(role);
}

// Middleware: require minimum role level
const requireRole = (...allowedRoles) => (req, res, next) => {
    if (!req.user) {
        return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }
    const userRole = req.user.role || 'Viewer';
    const allowed = allowedRoles.some(role => getRoleLevel(userRole) >= getRoleLevel(role));
    if (!allowed) {
        return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
    }
    next();
};

// Middleware: require exact role match
const requireExactRole = (...roles) => (req, res, next) => {
    if (!req.user) {
        return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }
    if (!roles.includes(req.user.role)) {
        return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
    }
    next();
};

// Middleware: admin-only
const adminOnly = requireRole('Company Admin');

module.exports = {
    ROLE_HIERARCHY,
    ADMIN_ROLES,
    getRoleLevel,
    hasMinRole,
    isAdmin,
    requireRole,
    requireExactRole,
    adminOnly,
};
