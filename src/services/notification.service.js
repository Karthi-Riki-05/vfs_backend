const { prisma } = require("../lib/prisma");

async function createNotification(
  userId,
  type,
  title,
  message,
  actionUrl = null,
  metadata = null,
) {
  return prisma.notification.create({
    data: { userId, type, title, message, actionUrl, metadata },
  });
}

async function getUserNotifications(
  userId,
  { unreadOnly = false, limit = 20 } = {},
) {
  const where = { userId };
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

async function getUnreadCount(userId) {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

module.exports = {
  createNotification,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
};
