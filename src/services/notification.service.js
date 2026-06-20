const { prisma } = require("../lib/prisma");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

/**
 * Push a freshly-created notification to the user's live socket session(s).
 *
 * Every connected socket joins a personal room `user:<userId>` (see
 * presenceEvents.js), so emitting to that room reaches every tab/device the
 * user has open and NO ONE ELSE — the targeting the P1 brief requires.
 *
 * We send the notification's own { teamId, appContext } so the client can
 * decide whether it belongs to the workspace it is currently viewing before
 * bumping the badge. The client ALSO refetches `/notifications/count`, which
 * is scoped server-side by the X-Team-Context / X-App-Context headers, so the
 * count stays correct even if the client's local context guess is stale.
 *
 * Best-effort: getIO() is null in tests and before Socket.IO boots, and a
 * socket failure must never roll back a persisted notification. Lazy-required
 * to avoid a require cycle at module load.
 */
function emitNotification(notification) {
  try {
    const { getIO } = require("../socket");
    const io = getIO();
    if (!io) return; // socket layer not initialised (e.g. unit tests)
    io.to(`user:${notification.userId}`).emit("notification:new", {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      actionUrl: notification.actionUrl,
      teamId: notification.teamId,
      appContext: notification.appContext,
      createdAt: notification.createdAt,
    });
  } catch (err) {
    logger.warn(`[Notification] real-time emit failed: ${err.message}`);
  }
}

/**
 * Build the strict { ownerId, teamId } workspace boundary for a query.
 *
 *   Team context      → { userId, teamId }
 *   Personal (pro)     → { userId, teamId: null, appContext: "pro" }
 *   Personal (team/free) → { userId, teamId: null, appContext: { in: ["free","team"] } }
 *
 * The Free Fold: in the personal Team-App container, free notifications fold
 * in alongside team ones (matching the flow/shape/project workspace scope in
 * flow.service._workspaceScope — `appContext: { in: ["team","free"] }`). The
 * Pro app stays strictly isolated so pro notifications never bleed into the
 * team-app feed and vice-versa (cross-app isolation).
 *
 * Never userId alone (would leak the other workspace's notifications) and
 * never teamId alone (DATA-LOSS-001 / ISOLATION P0). A caller MUST supply a
 * context — we fail closed rather than return everything the user owns.
 */
function buildScope({ userId, teamId = null, appContext = null }) {
  if (!userId) {
    throw new AppError(
      "userId is required to scope notifications",
      400,
      "NOTIF_SCOPE_REQUIRED",
    );
  }
  if (!teamId && !appContext) {
    throw new AppError(
      "A workspace context (teamId or appContext) is required to read notifications",
      400,
      "NOTIF_CONTEXT_REQUIRED",
    );
  }

  const where = { userId };
  if (teamId) {
    where.teamId = teamId; // team workspace — strict per-team isolation
    return where;
  }

  // Personal workspace — exclude team notifications.
  where.teamId = null;
  if (appContext === "pro") {
    // Pro app: strict isolation — only the user's pro notifications.
    where.appContext = "pro";
  } else {
    // Team-App container: free folds into team. Surface both so a free user
    // who upgrades (same account) keeps a continuous feed.
    where.appContext = { in: ["free", "team"] };
  }
  return where;
}

async function createNotification(
  userId,
  type,
  title,
  message,
  actionUrl = null,
  metadata = null,
  appContext = "team",
  teamId = null,
) {
  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      actionUrl,
      metadata,
      appContext,
      teamId,
    },
  });

  // P1: deliver in real time so the bell updates instantly instead of on the
  // next 60s poll. Non-blocking, fail-open.
  emitNotification(notification);

  return notification;
}

async function getUserNotifications(
  userId,
  { unreadOnly = false, limit = 20, appContext = null, teamId = null } = {},
) {
  const where = buildScope({ userId, teamId, appContext });
  if (unreadOnly) where.isRead = false;
  return prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });
}

async function markAsRead(notificationId, userId) {
  // Scope by userId so a notification can't be marked from another account.
  const updated = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true },
  });
  return { count: updated.count };
}

async function markAllAsRead(
  userId,
  { appContext = null, teamId = null } = {},
) {
  // Scope to the active workspace so "mark all read" in one context never
  // clears the other workspace's unread badge.
  const where = buildScope({ userId, teamId, appContext });
  where.isRead = false;
  const updated = await prisma.notification.updateMany({
    where,
    data: { isRead: true },
  });
  return { count: updated.count };
}

async function getUnreadCount(
  userId,
  { appContext = null, teamId = null } = {},
) {
  const where = buildScope({ userId, teamId, appContext });
  where.isRead = false;
  return prisma.notification.count({ where });
}

/**
 * Physically delete a single notification — strict IDOR protection.
 *
 * Scoped by { id, userId } via deleteMany so a user can only ever remove their
 * OWN row; a mismatched (id, userId) deletes nothing and returns { count: 0 }
 * rather than throwing (idempotent for the client). No workspace context is
 * needed: the (id, userId) pair already uniquely identifies the row.
 */
async function deleteNotification(notificationId, userId) {
  const deleted = await prisma.notification.deleteMany({
    where: { id: notificationId, userId },
  });
  return { count: deleted.count };
}

/**
 * Physically delete every notification in the caller's ACTIVE workspace.
 *
 * Reuses buildScope() so the delete respects the exact same boundary as the
 * list/count reads: inside the Team App it only touches the active team's (or
 * the folded free/team personal) notifications and NEVER the user's private
 * Pro-App feed, and vice-versa (ISOLATION P0 / DATA-LOSS-001).
 */
async function deleteAllNotifications(
  userId,
  { appContext = null, teamId = null } = {},
) {
  const where = buildScope({ userId, teamId, appContext });
  const deleted = await prisma.notification.deleteMany({ where });
  return { count: deleted.count };
}

module.exports = {
  createNotification,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  deleteNotification,
  deleteAllNotifications,
};
