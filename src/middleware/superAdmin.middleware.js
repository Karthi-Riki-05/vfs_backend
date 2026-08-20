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
//
// bug-144: this used to patch res.json ONLY. Handlers that reply with a
// non-JSON body — exportUsersCsv uses res.send, because a CSV download is not
// JSON — therefore slipped past the audit entirely: the single action that
// exfiltrates every user's email and Stripe customer id left no row, while
// trivial ones were logged faithfully.
//
// res.json() delegates to res.send() internally, so patching both would log a
// JSON response twice. The `logged` latch makes the first writer win and turns
// the nested call into a no-op.
const logAdminAction = (action) => (req, res, next) => {
  let logged = false;

  const writeAuditRow = (payload) => {
    if (logged) return;
    const statusCode = res.statusCode || 200;
    // Unchanged policy: only successful actions are recorded. A JSON envelope
    // may carry success:false with a 200; a CSV/text body has no envelope, so
    // status alone decides.
    const failedEnvelope =
      payload && typeof payload === "object" && payload.success === false;
    if (statusCode >= 400 || failedEnvelope) return;
    logged = true;

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
  };

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = (data) => {
    writeAuditRow(data);
    return originalJson(data);
  };
  res.send = (body) => {
    writeAuditRow(body);
    return originalSend(body);
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
