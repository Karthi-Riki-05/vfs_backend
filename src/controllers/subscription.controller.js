const subscriptionService = require('../services/subscription.service');
const asyncHandler = require('../utils/asyncHandler');

class SubscriptionController {
    getCurrentSubscription = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const subscription = await subscriptionService.getCurrentSubscription(userId);
        res.json({ success: true, data: subscription });
    });

    getPlans = asyncHandler(async (req, res) => {
        const plans = await subscriptionService.getPlans();
        res.json({ success: true, data: plans });
    });

    subscribe = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const { planId } = req.body;
        const subscription = await subscriptionService.subscribeToPlan(userId, planId);
        res.json({ success: true, data: subscription });
    });

    cancel = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        await subscriptionService.cancelSubscription(userId);
        res.json({ success: true, data: { message: 'Subscription cancelled successfully' } });
    });
}

module.exports = new SubscriptionController();
