const AppError = require("../utils/AppError");

/**
 * enforceProContext — server-side Pro app-context gate.
 *
 * The Pro app context used to be trusted from the client: any request carrying
 * `X-App-Context: pro` (or `?_appctx=pro`) was served the Pro data/billing
 * bucket. That let anyone append `?app=pro` (or set the header by hand) and read
 * Pro-scoped data without ever buying Pro — a revenue leak and a violation of
 * the "all data private by default" business rule.
 *
 * This guard moves access control to a strict server-side boundary: a request
 * may only claim the Pro context if the authenticated user is actually entitled
 * to Pro. Unentitled requests that claim `pro` are rejected with 403 /
 * UPGRADE_REQUIRED. It MUST run after `authenticate` (needs `req.user`); it is
 * invoked inline from auth.middleware so every authenticated route is covered
 * without per-route wiring, and is also exported as standalone middleware.
 *
 * NOTE: this is the authoritative boundary. The frontend ProGuard block is
 * defense-in-depth/UX only — never the gate.
 */

// Paths that legitimately carry `X-App-Context: pro` BEFORE the user is
// entitled, so they must NOT be gated:
//   - Pro acquisition / provisioning + switch + status (/pro, /upgrade-pro):
//     this is how a user becomes entitled (grant-from-mobile, purchase,
//     verify-purchase, switch-app). Gating them would be a chicken-and-egg lock.
//   - /users/active-context: ProGuard pins the active Pro context here during
//     bootstrap, right after a grant.
//   - /auth: login/session endpoints never depend on Pro entitlement.
const PRO_CONTEXT_EXEMPT = [
  "/pro/",
  "/upgrade-pro/",
  "/users/active-context",
  "/auth/",
];

function isExemptPath(originalUrl) {
  const path = String(originalUrl || "").split("?")[0];
  return PRO_CONTEXT_EXEMPT.some((p) => path.includes(p));
}

// True when the request asserts the Pro app context via header or query param.
// The frontend axios interceptor sends BOTH `X-App-Context` and `_appctx`.
function claimsProContext(req) {
  const header = String(req.headers["x-app-context"] || "").toLowerCase();
  const param = String((req.query && req.query._appctx) || "").toLowerCase();
  return header === "pro" || param === "pro";
}

// A user is entitled to the Pro context when they own Pro (`hasPro` — covers
// admin/team grants) OR have an explicit purchase timestamp (`proPurchasedAt`).
function isProEntitled(user) {
  return !!user && (user.hasPro === true || user.proPurchasedAt != null);
}

// Returns an AppError to reject with, or null when the request is allowed.
// Pure + synchronous so it can be unit-tested and invoked inline.
function proContextViolation(req) {
  if (!claimsProContext(req)) return null;
  if (isProEntitled(req.user)) return null;
  if (isExemptPath(req.originalUrl)) return null;
  return new AppError(
    "Pro access required. Upgrade to use the Pro app.",
    403,
    "UPGRADE_REQUIRED",
  );
}

// Standalone middleware form (run AFTER authenticate).
function enforceProContext(req, res, next) {
  const violation = proContextViolation(req);
  if (violation) return next(violation);
  next();
}

module.exports = {
  enforceProContext,
  proContextViolation,
  isProEntitled,
  claimsProContext,
};
