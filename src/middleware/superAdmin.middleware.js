const { prisma } = require("../lib/prisma");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

const requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new AppError("Authentication required", 401, "UNAUTHORIZED"));
  }
  if (req.user.role !== "super_admin") {
    return next(new AppError("Super admin access required", 403, "FORBIDDEN"));
  }
  next();
};

// Wraps the response so every successful super-admin action is persisted
// to admin_logs. Never throws — audit failures are non-fatal.
const logAdminAction = (action) => (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    const statusCode = res.statusCode || 200;
    if (data && data.success !== false && statusCode < 400) {
      prisma.adminLog
        .create({
          data: {
            adminId: req.user.id,
            targetUserId:
              req.params.userId || (req.body && req.body.userId) || null,
            action,
            details: {
              method: req.method,
              path: req.originalUrl,
              params: req.params,
              body: sanitizeBody(req.body),
            },
            ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
          },
        })
        .catch((err) =>
          logger.warn(`[AdminLog] Failed to log '${action}': ${err.message}`),
        );
    }
    return originalJson(data);
  };
  next();
};

// Strip sensitive fields before persisting the request body
function sanitizeBody(body) {
  if (!body || typeof body !== "object") return body;
  const { password, newPassword, token, ...safe } = body;
  return safe;
}

module.exports = { requireSuperAdmin, logAdminAction };
