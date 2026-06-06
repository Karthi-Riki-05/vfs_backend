const notificationService = require("../services/notification.service");
const asyncHandler = require("../utils/asyncHandler");

class NotificationController {
  list = asyncHandler(async (req, res) => {
    const unreadOnly = req.query.unreadOnly === "true";
    const limit = Number(req.query.limit) || 20;
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const items = await notificationService.getUserNotifications(req.user.id, {
      unreadOnly,
      limit,
      appContext,
    });
    res.json({ success: true, data: items });
  });

  count = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const unread = await notificationService.getUnreadCount(
      req.user.id,
      appContext,
    );
    res.json({ success: true, data: { unread } });
  });

  markRead = asyncHandler(async (req, res) => {
    const result = await notificationService.markAsRead(
      req.params.id,
      req.user.id,
    );
    res.json({ success: true, data: result });
  });

  markAllRead = asyncHandler(async (req, res) => {
    const result = await notificationService.markAllAsRead(req.user.id);
    res.json({ success: true, data: result });
  });
}

module.exports = new NotificationController();
