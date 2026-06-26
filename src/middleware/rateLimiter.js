const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const securityAlert = require("../services/securityAlert.service");

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
      // On breach: fire a fail-open security alert to the team owner/admins,
      // then send the SAME response body the `message` option would have sent.
      handler: (req, res, _next, options) => {
        securityAlert.alertInviteRateLimit({
          actorId: req.user?.id,
          actorEmail: req.user?.email,
          teamId:
            req.params?.teamId ||
            req.body?.teamId ||
            req.headers["x-team-context"] ||
            null,
          ip: req.ip,
          route: req.originalUrl,
        }); // intentionally not awaited — must not delay the 429
        res.status(options.statusCode).json(options.message);
      },
      message: {
        success: false,
        error: {
          code: "INVITE_RATE_LIMIT",
          message: "Too many invite requests. Please try again in a minute.",
        },
      },
    });

// Keyed per target email — a 45s-equivalent server cooldown that mirrors the
// client-side resend timer. Prevents mailbox-bombing an unverified address and
// stops OTP churn. Falls back to IP when no email is present in the body.
const resendLimiter = isTest
  ? passthrough
  : rateLimit({
      windowMs: 60 * 1000, // 60 seconds
      max: 1,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req, res) => {
        const email = req.body?.email;
        if (email && typeof email === "string") {
          return `resend:${email.trim().toLowerCase()}`;
        }
        return keyByUserOrIp(req, res);
      },
      message: {
        success: false,
        error: {
          code: "RESEND_RATE_LIMIT",
          message: "Please wait before requesting another code.",
        },
      },
    });

// Per-user message throttle on chat sends — 30 messages / minute. Keyed by
// user id so one chatty user can't slow the room for everyone else. Exposed as
// a builder so tests can exercise the real limiter (the live `chatMessageLimiter`
// is bypassed under NODE_ENV=test like the others).
const buildChatMessageLimiter = () =>
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 messages per minute
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => {
      if (req.user?.id) return `chat:u:${req.user.id}`;
      return keyByUserOrIp(req, res);
    },
    message: {
      success: false,
      error: {
        code: "CHAT_RATE_LIMIT",
        message: "Too many messages. Please slow down.",
      },
    },
  });

const chatMessageLimiter = isTest ? passthrough : buildChatMessageLimiter();

module.exports = {
  globalLimiter,
  authLimiter,
  aiLimiter,
  inviteLimiter,
  resendLimiter,
  chatMessageLimiter,
  buildChatMessageLimiter,
};
