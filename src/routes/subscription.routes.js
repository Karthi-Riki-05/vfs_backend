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
