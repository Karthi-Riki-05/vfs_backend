const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');
const { authenticate } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate');
const { subscribeSchema, createCheckoutSchema, changePlanSchema, verifySessionSchema } = require('../validators/subscription.validator');

// Stripe webhook (no auth, raw body)
router.post('/webhook', subscriptionController.handleWebhook);

/**
 * @swagger
 * /api/v1/subscription/plans:
 *   get:
 *     summary: Get available subscription plans (public)
 *     tags: [Subscription]
 *     responses:
 *       200:
 *         description: List of plans
 */
router.get('/plans', subscriptionController.getPlans);

// Subscription info (dashboard widget) — needs auth
router.get('/info', authenticate, async (req, res) => {
    try {
        const { prisma } = require('../lib/prisma');
        const userId = req.user.id;

        // Get user's subscription with plan
        let sub = null;
        try {
            sub = await prisma.subscription.findUnique({
                where: { userId },
                include: { plan: true },
            });
        } catch { /* table may not exist */ }

        // Get user for pro status
        let user = null;
        try {
            user = await prisma.user.findUnique({
                where: { id: userId },
                select: { hasPro: true, currentVersion: true },
            });
        } catch { /* fields may not exist */ }

        // Count chat messages (last 30 days)
        let messagesUsed = 0;
        try {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            messagesUsed = await prisma.chatMessage.count({
                where: { senderId: userId, createdAt: { gte: thirtyDaysAgo } },
            });
        } catch { /* table may not exist */ }

        // Storage estimate from flows
        let storageUsedMb = 0;
        try {
            const flows = await prisma.flow.findMany({
                where: { ownerId: userId, deletedAt: null },
                select: { diagramData: true },
            });
            const totalBytes = flows.reduce((sum, f) => sum + (f.diagramData?.length || 0), 0);
            storageUsedMb = Math.round((totalBytes / 1024 / 1024) * 100) / 100;
        } catch { /* ignore */ }

        // Build response
        if (!sub) {
            return res.json({ success: true, data: {
                plan: 'Free',
                is_active: true,
                is_pro: !!(user?.hasPro),
                expires_at: null,
                billing_period_days: 30,
                messages_used: messagesUsed,
                messages_limit: 50,
                storage_used_mb: storageUsedMb,
                storage_limit_mb: 100,
            }});
        }

        const isActive = sub.status === 'active' || sub.status === 'trialing';
        const expiresAt = sub.expiresAt || null;

        res.json({ success: true, data: {
            plan: sub.plan?.name || 'Free',
            is_active: isActive,
            is_pro: !!(user?.hasPro),
            expires_at: expiresAt,
            billing_period_days: sub.plan?.duration === 'yearly' ? 365 : 30,
            messages_used: messagesUsed,
            messages_limit: sub.plan?.tier >= 1 ? 500 : 50,
            storage_used_mb: storageUsedMb,
            storage_limit_mb: sub.plan?.tier >= 1 ? 1000 : 100,
        }});
    } catch (err) {
        console.error('Subscription info error:', err);
        res.json({ success: true, data: {
            plan: 'Free', is_active: true, is_pro: false,
            expires_at: null, messages_used: 0, messages_limit: 50,
        }});
    }
});

// All routes below require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/v1/subscription/create-checkout-session:
 *   post:
 *     summary: Create a Stripe checkout session
 *     tags: [Subscription]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [plan, teamMembers]
 *             properties:
 *               plan:
 *                 type: string
 *                 enum: [monthly, yearly]
 *               teamMembers:
 *                 type: number
 *                 enum: [5, 10, 15, 20, 25, 30]
 *     responses:
 *       200:
 *         description: Stripe checkout session created
 */
router.post('/create-checkout-session', validate(createCheckoutSchema), subscriptionController.createCheckoutSession);

router.post('/verify-session', validate(verifySessionSchema), subscriptionController.verifySession);

/**
 * @swagger
 * /api/v1/subscription/status:
 *   get:
 *     summary: Get current subscription status
 *     tags: [Subscription]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription status
 */
router.get('/status', subscriptionController.getStatus);

/**
 * @swagger
 * /api/v1/subscription/change-plan:
 *   post:
 *     summary: Change current subscription plan
 *     tags: [Subscription]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [plan, teamMembers]
 *             properties:
 *               plan:
 *                 type: string
 *                 enum: [monthly, yearly]
 *               teamMembers:
 *                 type: number
 *                 enum: [5, 10, 15, 20, 25, 30]
 *     responses:
 *       200:
 *         description: Plan changed successfully
 */
router.post('/change-plan', validate(changePlanSchema), subscriptionController.changePlan);

/**
 * @swagger
 * /api/v1/subscription/current:
 *   get:
 *     summary: Get current user's subscription
 *     tags: [Subscription]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current subscription details
 *       401:
 *         description: Unauthorized
 */
router.get('/current', subscriptionController.getCurrentSubscription);

/**
 * @swagger
 * /api/v1/subscription/subscribe:
 *   post:
 *     summary: Subscribe to a plan
 *     tags: [Subscription]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planId]
 *             properties:
 *               planId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Subscription created/updated
 *       400:
 *         description: Validation error
 */
router.post('/subscribe', validate(subscribeSchema), subscriptionController.subscribe);

/**
 * @swagger
 * /api/v1/subscription/cancel:
 *   post:
 *     summary: Cancel current subscription
 *     tags: [Subscription]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription cancelled
 */
router.post('/cancel', subscriptionController.cancel);

/**
 * @swagger
 * /api/v1/subscription/reactivate:
 *   post:
 *     summary: Reactivate a cancelling subscription
 *     tags: [Subscription]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription reactivated
 *       400:
 *         description: Subscription is not in cancelling state
 *       404:
 *         description: No subscription found
 */
router.post('/reactivate', subscriptionController.reactivate);

/**
 * @swagger
 * /api/v1/subscription/activate-now:
 *   post:
 *     summary: Activate a scheduled plan change immediately
 *     tags: [Subscription]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Returns checkout session URL for the new plan
 *       400:
 *         description: No scheduled change found
 */
router.post('/activate-now', subscriptionController.activateNow);

/**
 * @swagger
 * /api/v1/subscription/cancel-scheduled:
 *   post:
 *     summary: Cancel a scheduled plan change
 *     tags: [Subscription]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Scheduled change cancelled
 *       400:
 *         description: No scheduled change found
 */
router.post('/cancel-scheduled', subscriptionController.cancelScheduled);

module.exports = router;
