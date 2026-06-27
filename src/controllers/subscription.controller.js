const subscriptionService = require("../services/subscription.service");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const { prisma } = require("../lib/prisma");
const { getEntitlements } = require("../services/entitlements.service");

class SubscriptionController {
  // Subscription info (dashboard widget)
  getInfo = async (req, res) => {
    try {
      const userId = req.user.id;

      // Get user's subscription with plan
      let sub = null;
      try {
        sub = await prisma.subscription.findUnique({
          where: { userId },
          include: { plan: true },
        });
      } catch {
        /* table may not exist */
      }

      // Get user for pro status
      let user = null;
      try {
        user = await prisma.user.findUnique({
          where: { id: userId },
          select: { hasPro: true, currentVersion: true },
        });
      } catch {
        /* fields may not exist */
      }

      // Count chat messages (last 30 days)
      let messagesUsed = 0;
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        messagesUsed = await prisma.chatMessage.count({
          where: { senderId: userId, createdAt: { gte: thirtyDaysAgo } },
        });
      } catch {
        /* table may not exist */
      }

      // Plan tier drives the team/pro/free distinction used below.
      const tier = sub?.plan?.tier ?? 0;
      const isTeamPlan = tier >= 2;

      // Message ceiling comes from the entitlements matrix (per-user owned
      // tier), never hardcoded — keeps the widget aligned with billing.
      const entitlements = await getEntitlements(userId);
      const messagesLimit = entitlements.limits.messagesLimit || 50;

      // Build response
      if (!sub) {
        return res.json({
          success: true,
          data: {
            plan: "Free",
            is_active: true,
            is_pro: !!user?.hasPro,
            tier: 0,
            app_context: user?.hasPro ? "pro" : "free",
            expires_at: null,
            billing_period_days: 30,
            messages_used: messagesUsed,
            messages_limit: messagesLimit,
          },
        });
      }

      const isActive = sub.status === "active" || sub.status === "trialing";
      const expiresAt = sub.expiresAt || null;

      res.json({
        success: true,
        data: {
          plan: sub.plan?.name || "Free",
          is_active: isActive,
          // is_pro reflects the Pro lifetime entitlement only. The widget uses
          // app_context/tier (below) to decide whether to render the PRO badge,
          // so a Team plan no longer shows a stray "PRO" tag.
          is_pro: !!user?.hasPro,
          tier,
          app_context: isTeamPlan ? "team" : tier >= 1 ? "pro" : "free",
          expires_at: expiresAt,
          billing_period_days: sub.plan?.duration === "yearly" ? 365 : 30,
          messages_used: messagesUsed,
          messages_limit: messagesLimit,
        },
      });
    } catch (err) {
      logger.error("Subscription info error:", err);
      res.json({
        success: true,
        data: {
          plan: "Free",
          is_active: true,
          is_pro: false,
          tier: 0,
          app_context: "free",
          expires_at: null,
          messages_used: 0,
          messages_limit: 50,
        },
      });
    }
  };

  // --- New Stripe checkout flow ---
  createCheckoutSession = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { plan, teamMembers, paymentMethodId } = req.body;
    const result = await subscriptionService.createCheckoutSession(userId, {
      plan,
      teamMembers,
      paymentMethodId,
    });
    res.json({ success: true, data: result });
  });

  handleWebhook = asyncHandler(async (req, res) => {
    const signature = req.headers["stripe-signature"];
    const rawBody = req.rawBody || req.body;
    const result = await subscriptionService.handleWebhook(rawBody, signature);
    res.json({ success: true, data: result });
  });

  getStatus = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const status = await subscriptionService.getStatus(userId);
    res.json({ success: true, data: status });
  });

  changePlan = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { plan, teamMembers } = req.body;
    const result = await subscriptionService.changePlan(userId, {
      plan,
      teamMembers,
    });
    res.json({ success: true, data: result });
  });

  verifySession = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { sessionId } = req.body;
    const result = await subscriptionService.verifySession(userId, sessionId);
    res.json({ success: true, data: result });
  });

  // --- Legacy endpoints ---
  getCurrentSubscription = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const subscription =
      await subscriptionService.getCurrentSubscription(userId);
    res.json({ success: true, data: subscription });
  });

  getPlans = asyncHandler(async (req, res) => {
    const plans = await subscriptionService.getPlans();
    res.json({ success: true, data: plans });
  });

  subscribe = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { planId } = req.body;
    const subscription = await subscriptionService.subscribeToPlan(
      userId,
      planId,
    );
    res.json({ success: true, data: subscription });
  });

  cancel = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    await subscriptionService.cancelSubscription(userId);
    res.json({
      success: true,
      data: { message: "Subscription cancelled successfully" },
    });
  });

  reactivate = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const result = await subscriptionService.reactivateSubscription(userId);
    res.json({ success: true, data: result });
  });

  activateNow = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const result = await subscriptionService.activateScheduledPlan(userId);
    res.json({ success: true, data: result });
  });

  cancelScheduled = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const result = await subscriptionService.cancelScheduledChange(userId);
    res.json({ success: true, data: result });
  });

  createPortalSession = asyncHandler(async (req, res) => {
    const result = await subscriptionService.createCustomerPortalSession(
      req.user.id,
      req.body?.returnPath,
    );
    res.json({ success: true, data: result });
  });

  getHistory = asyncHandler(async (req, res) => {
    // Default to the user's current workspace so each app's Billing page
    // shows only its own purchases. Pass ?appContext=all to bypass
    // (admin / debugging only).
    const appContext =
      req.query?.appContext === "all"
        ? null
        : req.headers["x-app-context"] || req.user.currentVersion || "team";
    const result = await subscriptionService.getHistory(req.user.id, {
      ...req.query,
      appContext,
    });
    res.json({ success: true, data: result });
  });
}

module.exports = new SubscriptionController();
