const express = require("express");
const router = express.Router();
const superAdminController = require("../controllers/superAdmin.controller");
const { authenticate } = require("../middleware/auth.middleware");
const {
  requireSuperAdmin,
  logAdminAction,
} = require("../middleware/superAdmin.middleware");

// All routes require auth + super_admin role
router.use(authenticate);
router.use(requireSuperAdmin);

// Dashboard
router.get("/dashboard/stats", superAdminController.getDashboardStats);

// Users
router.get("/users", superAdminController.getUsers);
router.post(
  "/users",
  logAdminAction("user_created"),
  superAdminController.createUser,
);
router.get("/users/:userId", superAdminController.getUserDetail);
router.put(
  "/users/:userId",
  logAdminAction("user_updated"),
  superAdminController.updateUser,
);
router.delete(
  "/users/:userId",
  logAdminAction("user_deleted"),
  superAdminController.deleteUser,
);
router.post(
  "/users/:userId/suspend",
  logAdminAction("user_suspended"),
  superAdminController.suspendUser,
);
router.post(
  "/users/:userId/reactivate",
  logAdminAction("user_reactivated"),
  superAdminController.reactivateUser,
);
router.post(
  "/users/:userId/reset-password",
  logAdminAction("password_reset"),
  superAdminController.resetUserPassword,
);
router.get("/users/:userId/activity", superAdminController.getUserActivity);
router.get("/users/:userId/ai-usage", superAdminController.getUserAiUsage);

// User search (for grant-subscription autocomplete)
router.get("/users-search", superAdminController.searchUsers);

// Subscriptions
router.get("/subscriptions", superAdminController.getSubscriptions);
router.post(
  "/users/:userId/subscription",
  logAdminAction("subscription_granted"),
  superAdminController.grantSubscription,
);
router.delete(
  "/users/:userId/subscription",
  logAdminAction("subscription_cancelled"),
  superAdminController.cancelSubscription,
);
router.post(
  "/users/:userId/subscription/expire",
  logAdminAction("subscription_expired"),
  superAdminController.forceExpireSubscription,
);
router.get(
  "/users/:userId/subscription-history",
  superAdminController.getSubscriptionHistory,
);

// Team management (super-admin view)
router.get("/users/:userId/team", superAdminController.getUserTeam);
router.post(
  "/users/:userId/team/members",
  logAdminAction("team_member_added"),
  superAdminController.addTeamMember,
);
router.delete(
  "/users/:userId/team/members/:memberId",
  logAdminAction("team_member_removed"),
  superAdminController.removeTeamMember,
);
router.put(
  "/users/:userId/ai-credits",
  logAdminAction("credits_adjusted"),
  superAdminController.adjustAiCredits,
);

// Admin audit log
router.get("/admin-logs", superAdminController.getAdminLogs);

// All-user activity (Phase 4 system logs tab 1)
router.get("/user-activity", superAdminController.getAllUserActivity);

// AI Usage analytics
router.get("/ai-usage/stats", superAdminController.getAiUsageStats);

// CSV export
router.get(
  "/users/export/csv",
  logAdminAction("users_exported"),
  superAdminController.exportUsersCsv,
);

// Settings
router.get("/settings", superAdminController.getSettings);
router.get("/settings/test-connection", superAdminController.testApiConnection);
router.post(
  "/settings/super-admins",
  logAdminAction("super_admin_granted"),
  superAdminController.addSuperAdmin,
);
router.delete(
  "/settings/super-admins/:userId",
  logAdminAction("super_admin_revoked"),
  superAdminController.removeSuperAdmin,
);

// Refunds
router.post(
  "/refunds",
  logAdminAction("refund_processed"),
  superAdminController.processRefund,
);

// Notifications (push broadcast — used for tests + maintenance announcements)
router.get("/notifications/devices", superAdminController.countDevices);
router.post(
  "/notifications/broadcast",
  logAdminAction("notification_broadcast"),
  superAdminController.broadcastNotification,
);

module.exports = router;
