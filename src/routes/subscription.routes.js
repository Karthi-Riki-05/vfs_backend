const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');
const { authenticate } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate');
const { subscribeSchema } = require('../validators/subscription.validator');

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

module.exports = router;
