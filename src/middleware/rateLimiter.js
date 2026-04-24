const rateLimit = require("express-rate-limit");
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
function keyByUserOrIp(req) {
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
  return req.ip;
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

module.exports = { globalLimiter, authLimiter, aiLimiter };
