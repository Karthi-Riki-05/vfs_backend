const { prisma } = require("../lib/prisma");

async function createNotification(
  userId,
  type,
  title,
  message,
  actionUrl = null,
  metadata = null,
  appContext = "team",
) {
  return prisma.notification.create({
    data: { userId, type, title, message, actionUrl, metadata, appContext },
  });
}

async function getUserNotifications(
  userId,
  { unreadOnly = false, limit = 20, appContext = null } = {},
) {
  const where = { userId };
  if (appContext) where.appContext = appContext;
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

async function markAllAsRead(userId) {
  const updated = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
  return { count: updated.count };
}

async function getUnreadCount(userId, appContext = null) {
  const where = { userId, isRead: false };
  if (appContext) where.appContext = appContext;
  return prisma.notification.count({ where });
}

module.exports = {
  createNotification,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
};
