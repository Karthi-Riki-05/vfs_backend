// Thin push-notification facade. All sends are best-effort and never throw
// — callers wrap business-critical work and shouldn't fail because Firebase
// is misconfigured or a token expired.
//
// Delegates the low-level Firebase Admin call to fcm.service.js (which
// initialises the SDK on demand from FIREBASE_PROJECT_ID/CLIENT_EMAIL/
// PRIVATE_KEY) and adds:
//   - sendPushToUser(userId, notification)
//   - sendPushToMultipleUsers(userIds, notification)
//   - typed builders (teamInvite, paymentSuccess, etc.) so call-sites stay
//     consistent and don't reinvent wording.

const fcm = require("./fcm.service");
const { prisma } = require("../lib/prisma");
const logger = require("../utils/logger");
const notificationPreference = require("./notificationPreference.service");
const quietHours = require("./notificationQuietHours.service");
const rateLimit = require("./notificationRateLimit.service");

// appContext ("pro" | "team", optional) narrows delivery to devices
// registered from that app — plus any legacy device with no recorded
// appContext (fail-open). Omit it to keep sending to every device the user
// has registered, regardless of app (existing behaviour for call sites not
// yet updated to pass one).
//
// category (optional, bug-019/022/023): when given, checked in the BRD's
// stated precedence order (docs/notifications-brd.md §5.3 point 5):
//   1. per-category push preference (bug-019) — skippable only via an
//      explicit opt-out; non-disableable categories always pass.
//   2. quiet hours (bug-022) — only consulted for disableable categories;
//      non-disableable ones always override it.
//   3. rate cap (bug-023) — UNIVERSAL, applies even to non-disableable
//      categories (the BRD itself caps TEAM_INVITE at 6/hr).
//   4. dedup window (bug-023) — same, universal.
// Omitting category (existing call sites not yet updated) skips all of the
// above — same backward-compatible opt-in pattern used throughout this file.
// Every check fails open on error — never blocks a real push.
async function sendPushToUser(
  userId,
  { title, body, data = {} },
  appContext = null,
  category = null,
) {
  try {
    if (category) {
      const enabled = await notificationPreference
        .isChannelEnabled(userId, category, "push", appContext || "team")
        .catch(() => true);
      if (!enabled) {
        return { success: false, skipped: true, reason: "preference_disabled" };
      }
      if (!notificationPreference.isNonDisableable(category)) {
        const quiet = await quietHours
          .isInQuietHours(userId)
          .catch(() => false);
        if (quiet) {
          return { success: false, skipped: true, reason: "quiet_hours" };
        }
      }
      if (!rateLimit.checkRateLimit(userId, category).allowed) {
        return { success: false, skipped: true, reason: "rate_cap" };
      }
      if (!rateLimit.checkDedup(userId, category, title, body).allowed) {
        return { success: false, skipped: true, reason: "dedup" };
      }
    }
    return await fcm.sendToUser(userId, title, body, data || {}, appContext);
  } catch (err) {
    logger.warn(`[push] sendPushToUser failed user=${userId}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function sendPushToMultipleUsers(
  userIds,
  notification,
  appContext = null,
  category = null,
) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  // Find which users actually have a registered device, deduped to UNIQUE
  // userIds — sendPushToUser fans out across all of a user's devices itself,
  // so calling it per device-row would send duplicate notifications.
  const fbUsers = await prisma.firebaseUser.findMany({
    where: {
      userId: { in: userIds },
      fcmToken: { not: null },
      deletedAt: null,
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  const results = [];
  for (const u of fbUsers) {
    const r = await sendPushToUser(
      u.userId,
      notification,
      appContext,
      category,
    );
    results.push({ userId: u.userId, ...r });
  }
  return results;
}

const builders = {
  teamInvite: ({ inviterName, teamName, token, isPro }) => ({
    title: `${inviterName || "Someone"} invited you to a team`,
    body: `Join ${teamName || "their team"} on ValueChart${isPro ? " Pro" : ""}`,
    data: { type: "team_invite", token, url: `/invite/accept?token=${token}` },
  }),
  paymentSuccess: ({ planName }) => ({
    title: "Payment confirmed",
    body: `Your ${planName || "plan"} is now active.`,
    data: { type: "payment", url: "/dashboard/subscription" },
  }),
  paymentFailed: () => ({
    title: "Payment failed",
    body: "Update your payment method to keep your subscription active.",
    data: { type: "payment", url: "/dashboard/subscription" },
  }),
  flowPackExpiring: ({ packLabel, daysLeft }) => ({
    title: "Flow pack expiring soon",
    body: `Your ${packLabel || "flow pack"} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
    data: { type: "flow_pack", url: "/dashboard/flows" },
  }),
  flowPackExpired: () => ({
    title: "Flow pack expired",
    body: "Select 10 flows to keep on the free plan.",
    data: { type: "flow_picker", url: "/dashboard/flows" },
  }),
  newMessage: ({ senderName, preview, groupId }) => ({
    title: `${senderName || "New message"}`,
    body: (preview || "").slice(0, 140),
    data: {
      type: "chat",
      groupId: groupId || "",
      url: `/dashboard/chat${groupId ? `/${groupId}` : ""}`,
    },
  }),
};

module.exports = {
  sendPushToUser,
  sendPushToMultipleUsers,
  builders,
};
