const logger = require("../utils/logger");

// In-memory anti-spam state (bug-023). Same trade-off already accepted for
// socket/userSocketMap.js: sub-millisecond checks, cleared on restart,
// assumes a single backend process. Horizontal scaling would need a shared
// store (Redis) — not addressed here.
//
// Map<"userId:category", number[]>  — epoch-ms timestamps within the
// rolling 1-hour rate-limit window.
const sendTimestamps = new Map();
// Map<"userId:category:title:body", number> — epoch-ms of the last send,
// for the 5-minute dedup window.
const lastSent = new Map();

const HOUR_MS = 60 * 60 * 1000;
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

// Per-category hourly caps, taken from docs/notifications-brd.md §5.1 where
// our actual `type` strings overlap the BRD's catalogue. Applies universally
// — including to non-disableable/transactional categories (TEAM_INVITE is
// itself capped at 6/hr in the BRD) — this is a different class of control
// than preferences/quiet-hours, which only apply to disableable categories.
const CATEGORY_CAPS = {
  team_invite: 6,
  flow_updated: 8, // closest analogue to FLOW_COMMENT's digest-eligible cap
  // bug-026: keyed on the CALLING ADMIN's userId, not a recipient — caps how
  // often one super-admin account can trigger a platform-wide broadcast.
  admin_broadcast: 3,
};
const DEFAULT_CAP_PER_HOUR = 20;

function capFor(category) {
  return CATEGORY_CAPS[category] || DEFAULT_CAP_PER_HOUR;
}

/**
 * Sliding-window rate check. Records this attempt's timestamp regardless of
 * outcome (so a caller can't dodge the cap by only recording on success).
 * Fail-open on any internal error.
 */
function checkRateLimit(userId, category) {
  try {
    const key = `${userId}:${category}`;
    const now = Date.now();
    const cutoff = now - HOUR_MS;
    const existing = (sendTimestamps.get(key) || []).filter((t) => t > cutoff);
    const cap = capFor(category);
    const allowed = existing.length < cap;
    existing.push(now);
    sendTimestamps.set(key, existing);
    return { allowed, remaining: Math.max(0, cap - existing.length) };
  } catch (err) {
    logger.warn(
      `[notificationRateLimit] checkRateLimit failed, failing open: ${err.message}`,
    );
    return { allowed: true, remaining: null };
  }
}

/**
 * 5-minute duplicate-suppression window on an identical
 * (userId, category, title, body) triple. Fail-open on any internal error.
 */
function checkDedup(userId, category, title, body) {
  try {
    const key = `${userId}:${category}:${title}:${body}`;
    const now = Date.now();
    const last = lastSent.get(key);
    if (last && now - last < DEDUP_WINDOW_MS) {
      return { allowed: false };
    }
    lastSent.set(key, now);
    return { allowed: true };
  } catch (err) {
    logger.warn(
      `[notificationRateLimit] checkDedup failed, failing open: ${err.message}`,
    );
    return { allowed: true };
  }
}

module.exports = {
  checkRateLimit,
  checkDedup,
  CATEGORY_CAPS,
  DEFAULT_CAP_PER_HOUR,
};
