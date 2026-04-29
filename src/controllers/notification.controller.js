const notificationService = require("../services/notification.service");
const asyncHandler = require("../utils/asyncHandler");

class NotificationController {
  list = asyncHandler(async (req, res) => {
    const unreadOnly = req.query.unreadOnly === "true";
    const limit = Number(req.query.limit) || 20;
    const items = await notificationService.getUserNotifications(req.user.id, {
      unreadOnly,
      limit,
    });
    res.json({ success: true, data: items });
  });

  count = asyncHandler(async (req, res) => {
    const unread = await notificationService.getUnreadCount(req.user.id);
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
