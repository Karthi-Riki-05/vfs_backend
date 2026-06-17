const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const jwt = require("jsonwebtoken");

// In-process rate limiters share state across an entire Jest worker.
// That makes tests flaky (the 11th request in a 10/15-min window is 429).
// Bypass them in test env; dedicated rate-limit tests can use supertest's
// raw express-rate-limit if they need the real behaviour.
const isTest = process.env.NODE_ENV === "test";
const passthrough = (_req, _res, next) => next();

// Key rate-limit state per user when we can decode a bearer token.
// Fallback to IP for unauthenticated requests. This prevents one
// front-end proxy IP from counting as "one user" and blowing the
// limit across everyone's session.
function keyByUserOrIp(req, res) {
  try {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith("Bearer ")) {
      const token = auth.slice(7);
      const decoded = jwt.decode(token);
      if (decoded?.id) return `u:${decoded.id}`;
    }
  } catch {
    // fall through to IP
  }
  return ipKeyGenerator(req, res);
}

const globalLimiter = isTest
  ? passthrough
  : rateLimit({
      // Shorter window so a bad burst recovers in minutes, not 15.
      windowMs: 2 * 60 * 1000, // 2 minutes
      max: 600, // per user (or per IP when unauthenticated)
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: keyByUserOrIp,
      message: {
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests, please try again later.",
        },
      },
    });

const authLimiter = isTest
  ? passthrough
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: "AUTH_RATE_LIMIT",
          message: "Too many authentication attempts, please try again later.",
        },
      },
    });

const aiLimiter = isTest
  ? passthrough
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: "AI_RATE_LIMIT",
          message: "Too many AI requests, please try again later.",
        },
      },
    });

// Keyed per authenticated user — prevents a single abuser from flooding the
// mail server. Applied to POST /api/v1/teams/invite after authenticate runs.
const inviteLimiter = isTest
  ? passthrough
  : rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 5,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        if (req.user?.id) return `invite:u:${req.user.id}`;
        return keyByUserOrIp(req);
      },
      message: {
        success: false,
        error: {
          code: "INVITE_RATE_LIMIT",
          message: "Too many invite requests. Please try again in a minute.",
        },
      },
    });

module.exports = { globalLimiter, authLimiter, aiLimiter, inviteLimiter };
