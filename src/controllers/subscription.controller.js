const subscriptionService = require("../services/subscription.service");
const asyncHandler = require("../utils/asyncHandler");

class SubscriptionController {
  // --- New Stripe checkout flow ---
  createCheckoutSession = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { plan, teamMembers } = req.body;
    const result = await subscriptionService.createCheckoutSession(userId, {
      plan,
      teamMembers,
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
    );
    res.json({ success: true, data: result });
  });

  getHistory = asyncHandler(async (req, res) => {
    const result = await subscriptionService.getHistory(req.user.id, req.query);
    res.json({ success: true, data: result });
  });
}

module.exports = new SubscriptionController();
