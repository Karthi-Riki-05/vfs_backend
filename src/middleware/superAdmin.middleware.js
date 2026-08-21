const { prisma } = require("../lib/prisma");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

// bug-151: record the ATTEMPT, not just the outcome.
//
// The audit trail was success-only, which left two blind spots. This is the
// first: an authenticated non-super-admin probing this surface was refused with
// a 403 and left NO row anywhere in admin_logs. Someone with a stolen session
// could walk the whole admin API — try to delete a super admin, drain credits,
// export the user list — and an investigator opening the console would find an
// empty log. Denials go to the application log, but not to the trail anyone
// actually consults.
//
// Attributed to the caller (adminId is a plain user FK, required). A 401 has no
// identity to attribute and is skipped — those are already in the app log and
// cannot be tied to an account.
const writeDenial = (req) => {
  if (!req.user?.id) return;
  // Sync-safe: if the audit write throws (client not ready, table missing),
  // the DENIAL must still be a clean 403. A guard that 500s because its own
  // logging failed reports the wrong thing about the wrong subsystem.
  void (async () => {
    try {
      await prisma.adminLog.create({
        data: {
          adminId: req.user.id,
          targetUserId: req.params?.userId || null,
          action: "access_denied",
          details: {
            method: req.method,
            path: req.originalUrl,
            role: req.user.role || null,
            reason: "not_super_admin",
          },
          ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
        },
      });
    } catch (err) {
      logger.warn(`[AdminLog] Failed to log denial: ${err.message}`);
    }
  })();
};

const requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new AppError("Authentication required", 401, "UNAUTHORIZED"));
  }
  if (req.user.role !== "super_admin") {
    writeDenial(req);
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
    logged = true;
    const statusCode = res.statusCode || 200;
    // A JSON envelope may carry success:false with a 200; a CSV/text body has
    // no envelope, so status alone decides.
    const failedEnvelope =
      payload && typeof payload === "object" && payload.success === false;
    const refused = statusCode >= 400 || failedEnvelope;

    // bug-151, second blind spot: a super-admin action that is REFUSED (a
    // guard fired, validation rejected it) used to vanish. "Tried to suspend
    // another super admin" is exactly the line an investigation needs. The
    // action is prefixed so a refusal can never be mistaken for the real thing
    // in the log table, which renders `action` verbatim.
    // A dry run must not read as the real thing in the log. Without this, a
    // rehearsal and a send to every device appear as the same line.
    const isDryRun =
      payload && typeof payload === "object" && payload.data?.dryRun === true;
    const recordedAction = refused
      ? `refused:${action}`
      : isDryRun
        ? `dryrun:${action}`
        : action;
    const failure = refused
      ? {
          status: statusCode,
          errorCode:
            (payload && typeof payload === "object" && payload.error?.code) ||
            null,
        }
      : null;

    prisma.adminLog
      .create({
        data: {
          adminId: req.user.id,
          targetUserId:
            req.params.userId || (req.body && req.body.userId) || null,
          action: recordedAction,
          details: {
            method: req.method,
            path: req.originalUrl,
            params: req.params,
            body: sanitizeBody(req.body),
            ...(failure ? { outcome: "refused", ...failure } : {}),
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
