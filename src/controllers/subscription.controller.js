const subscriptionService = require('../services/subscription.service');

class SubscriptionController {
    async getCurrentSubscription(req, res) {
        try {
            const userId = req.user.id;
            const subscription = await subscriptionService.getCurrentSubscription(userId);
            res.json(subscription);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getPlans(req, res) {
        try {
            const plans = await subscriptionService.getPlans();
            res.json(plans);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async subscribe(req, res) {
        try {
            const userId = req.user.id;
            const { planId } = req.body;
            const subscription = await subscriptionService.subscribeToPlan(userId, planId);
            res.json(subscription);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async cancel(req, res) {
        try {
            const userId = req.user.id;
            await subscriptionService.cancelSubscription(userId);
            res.json({ message: 'Subscription cancelled successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new SubscriptionController();
