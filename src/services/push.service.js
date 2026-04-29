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

async function sendPushToUser(userId, { title, body, data = {} }) {
  try {
    return await fcm.sendToUser(userId, title, body, data || {});
  } catch (err) {
    logger.warn(`[push] sendPushToUser failed user=${userId}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function sendPushToMultipleUsers(userIds, notification) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  // Resolve tokens first — gives us a chance to clean up obviously-empty
  // rows before we try to push.
  const fbUsers = await prisma.firebaseUser.findMany({
    where: { userId: { in: userIds }, fcmToken: { not: null } },
    select: { userId: true, fcmToken: true },
  });
  const results = [];
  for (const u of fbUsers) {
    const r = await sendPushToUser(u.userId, notification);
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
