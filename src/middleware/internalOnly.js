const crypto = require("crypto");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

/**
 * internalOnly — gate a route to server-to-server callers only (bug-083).
 *
 * Some auth-adjacent routes (notably POST /auth/oauth-sync) are called by the
 * Next.js server after IT has completed a trust step the backend cannot see.
 * Without a caller check the request body IS the entire claim, which inverts
 * the "server is authoritative" rule in docs/xc-security.md: anyone able to
 * reach the API could enumerate accounts, mint user rows for addresses they do
 * not own, or repoint an OAuth Account link.
 *
 * Contract:
 *   • Caller must send `X-Internal-Auth: <INTERNAL_API_SECRET>`.
 *   • Mismatch, missing header, or unset secret → 404 (never 403: do not
 *     confirm that the route exists to an unauthorised caller).
 *   • Fails CLOSED when INTERNAL_API_SECRET is unset — an unconfigured deploy
 *     must not silently fall back to "anyone may call this".
 */
const HEADER = "x-internal-auth";

let warnedMissingSecret = false;

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  // timingSafeEqual throws on length mismatch, so compare digests of equal size.
  const digestA = crypto.createHash("sha256").update(bufA).digest();
  const digestB = crypto.createHash("sha256").update(bufB).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

module.exports = function internalOnly(req, res, next) {
  const secret = process.env.INTERNAL_API_SECRET;
  const notFound = () => next(new AppError("Not found", 404, "NOT_FOUND"));

  if (!secret) {
    if (!warnedMissingSecret) {
      logger.error(
        "INTERNAL_API_SECRET is not set — internal-only routes are refusing every caller (fail-closed). Set it for the backend AND the Next server.",
      );
      warnedMissingSecret = true;
    }
    return notFound();
  }

  const presented = req.headers[HEADER];
  if (!presented || !timingSafeEqualStr(presented, secret)) {
    logger.warn(
      `internalOnly: rejected ${req.method} ${req.originalUrl} from ${req.ip} (${presented ? "bad" : "missing"} ${HEADER})`,
    );
    return notFound();
  }

  next();
};
