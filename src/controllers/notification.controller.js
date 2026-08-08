const notificationService = require("../services/notification.service");
const notificationPreferenceService = require("../services/notificationPreference.service");
const notificationQuietHoursService = require("../services/notificationQuietHours.service");
const notificationTestService = require("../services/notificationTest.service");
const asyncHandler = require("../utils/asyncHandler");
const { workspaceHeader } = require("../lib/workspaceContext");

// Resolve the active { workspaceId, appContext } workspace boundary from the
// request. X-Workspace-Context (set on every /api call by the profile switcher)
// is the team boundary; X-App-Context / currentVersion is the personal one.
function resolveContext(req) {
  const workspaceId = workspaceHeader(req) || null;
  // Fallback is the platform default "team" — NOT req.user.currentVersion.
  // currentVersion is a base-tier column ("free" for most Team subscribers,
  // can be "pro" for users browsing the Team app), not a which-app-is-this-
  // request signal; using it made headerless requests leak notifications
  // across app containers (bug-052). The axios interceptor always sends
  // X-App-Context, so this fallback only fires for non-browser callers.
  const appContext = req.headers["x-app-context"] || "team";
  return { workspaceId, appContext };
}

class NotificationController {
  list = asyncHandler(async (req, res) => {
    const unreadOnly = req.query.unreadOnly === "true";
    const limit = Number(req.query.limit) || 20;
    const { workspaceId, appContext } = resolveContext(req);
    const items = await notificationService.getUserNotifications(req.user.id, {
      unreadOnly,
      limit,
      workspaceId,
      appContext,
    });
    res.json({ success: true, data: items });
  });

  count = asyncHandler(async (req, res) => {
    const { workspaceId, appContext } = resolveContext(req);
    const unread = await notificationService.getUnreadCount(req.user.id, {
      workspaceId,
      appContext,
    });
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
    const { workspaceId, appContext } = resolveContext(req);
    const result = await notificationService.markAllAsRead(req.user.id, {
      workspaceId,
      appContext,
    });
    res.json({ success: true, data: result });
  });

  // Delete every notification in the caller's active workspace. Reuses the
  // same resolved { workspaceId, appContext } boundary as list/count so it can
  // never spill across the Pro / Team-App divide.
  deleteAll = asyncHandler(async (req, res) => {
    const { workspaceId, appContext } = resolveContext(req);
    const result = await notificationService.deleteAllNotifications(
      req.user.id,
      { workspaceId, appContext },
    );
    res.json({ success: true, data: result });
  });

  // Delete a single notification. Scoped to { id, userId } in the service so a
  // user can only remove their own row (IDOR protection).
  remove = asyncHandler(async (req, res) => {
    const result = await notificationService.deleteNotification(
      req.params.id,
      req.user.id,
    );
    res.json({ success: true, data: result });
  });

  // Per-category channel preferences (bug-019), scoped to the caller's
  // active app — same X-App-Context convention as everywhere else.
  getPreferences = asyncHandler(async (req, res) => {
    const { appContext } = resolveContext(req);
    const items = await notificationPreferenceService.getPreferences(
      req.user.id,
      appContext,
    );
    res.json({ success: true, data: items });
  });

  updatePreference = asyncHandler(async (req, res) => {
    const { appContext } = resolveContext(req);
    const { category, inApp, push, email } = req.body || {};
    const result = await notificationPreferenceService.setPreference(
      req.user.id,
      { category, appContext, inApp, push, email },
    );
    res.json({ success: true, data: result });
  });

  // Quiet-hours window (bug-022). One global schedule per user — not scoped
  // by app, unlike preferences (see notificationQuietHours.service.js).
  getQuietHours = asyncHandler(async (req, res) => {
    const result = await notificationQuietHoursService.getQuietHours(
      req.user.id,
    );
    res.json({ success: true, data: result });
  });

  updateQuietHours = asyncHandler(async (req, res) => {
    const { enabled, startHour, endHour, timezone } = req.body || {};
    const result = await notificationQuietHoursService.setQuietHours(
      req.user.id,
      { enabled, startHour, endHour, timezone },
    );
    res.json({ success: true, data: result });
  });

  // --- Dev/test-only simulation endpoints (blocked in production) ---

  testScheduleExpiry = asyncHandler(async (req, res) => {
    const { email, expiryMinutes, target } = req.body;
    const result = await notificationTestService.scheduleExpiry({
      email,
      expiryMinutes,
      target,
    });
    res.json({ success: true, data: result });
  });

  triggerExpiryCheck = asyncHandler(async (req, res) => {
    const result = await notificationTestService.triggerExpiryCheck();
    res.json({ success: true, data: result });
  });
}

module.exports = new NotificationController();
