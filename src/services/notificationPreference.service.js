const { prisma } = require("../lib/prisma");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

// Transactional + security categories per docs/notifications-brd.md §5.1 —
// these can never be opted out of on any channel, regardless of any stored
// preference row. The codebase's actual `type` strings (see
// docs/notifications-technical.md §2.8) don't map 1:1 onto the BRD's 30-item
// catalogue, so this is a judgment-call mapping onto what's actually emitted
// today (see bug-019 for the reasoning).
const NON_DISABLEABLE_CATEGORIES = new Set([
  "SECURITY_ALERT",
  "team_invite",
  "team_seat_removed",
  "team_ownership_transfer",
  "subscription_activated",
  "subscription_cancelled",
  "subscription_expired",
  "flow_addon_payment_failed",
  // A team-plan payment failure is as critical as the add-on one: the user
  // must be able to fix their card before access lapses, so it cannot be
  // switched off.
  "subscription_payment_failed",
]);

function isNonDisableable(category) {
  return NON_DISABLEABLE_CATEGORIES.has(category);
}

/**
 * Check whether a given channel is enabled for a user/category/app.
 *
 * Fail-open by design: a missing row, a disabled preference lookup, or a DB
 * error must never silently swallow a real notification. This mirrors
 * push.service's existing best-effort philosophy — the preference layer is a
 * courtesy filter, not a gate that can break business-critical delivery.
 *
 * @param {string} userId
 * @param {string} category - the Notification.type / push category string
 * @param {"inApp"|"push"|"email"} channel
 * @param {"pro"|"team"} appContext
 * @returns {Promise<boolean>}
 */
async function isChannelEnabled(userId, category, channel, appContext) {
  if (isNonDisableable(category)) return true;
  try {
    const pref = await prisma.notificationPreference.findUnique({
      where: {
        userId_category_appContext: {
          userId,
          category,
          appContext: appContext === "pro" ? "pro" : "team",
        },
      },
      select: { inApp: true, push: true, email: true },
    });
    if (!pref) return true; // no row = default (matches pre-bug-019 behaviour)
    return pref[channel] !== false;
  } catch (err) {
    logger.warn(
      `[notificationPreference] isChannelEnabled lookup failed, failing open: ${err.message}`,
    );
    return true;
  }
}

async function getPreferences(userId, appContext) {
  const rows = await prisma.notificationPreference.findMany({
    where: { userId, appContext: appContext === "pro" ? "pro" : "team" },
    select: { category: true, inApp: true, push: true, email: true },
  });
  return rows.map((r) => ({ ...r, locked: isNonDisableable(r.category) }));
}

async function setPreference(
  userId,
  { category, appContext, inApp, push, email },
) {
  if (!category) {
    throw new AppError("category is required", 400, "VALIDATION_ERROR");
  }
  if (isNonDisableable(category)) {
    throw new AppError(
      `"${category}" is a transactional/security category and cannot be disabled`,
      400,
      "NOTIF_PREFERENCE_LOCKED",
    );
  }
  const scopedAppContext = appContext === "pro" ? "pro" : "team";
  const data = {};
  if (typeof inApp === "boolean") data.inApp = inApp;
  if (typeof push === "boolean") data.push = push;
  if (typeof email === "boolean") data.email = email;

  return prisma.notificationPreference.upsert({
    where: {
      userId_category_appContext: {
        userId,
        category,
        appContext: scopedAppContext,
      },
    },
    create: { userId, category, appContext: scopedAppContext, ...data },
    update: data,
  });
}

module.exports = {
  isChannelEnabled,
  getPreferences,
  setPreference,
  isNonDisableable,
  NON_DISABLEABLE_CATEGORIES,
};
