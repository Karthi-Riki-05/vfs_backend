const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { authenticate } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate');
const { createCheckoutSchema, getTransactionsQuerySchema } = require('../validators/payment.validator');

/**
 * @swagger
 * /api/v1/payments:
 *   post:
 *     summary: Create a Stripe checkout session
 *     tags: [Payments]
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
 *               successUrl:
 *                 type: string
 *               cancelUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: Checkout session created with URL
 *       404:
 *         description: Plan not found
 */
router.post('/', authenticate, validate(createCheckoutSchema), paymentController.createCheckout);

/**
 * @swagger
 * /api/v1/payments/webhook:
 *   post:
 *     summary: Stripe webhook handler
 *     tags: [Payments]
 *     description: Handles Stripe webhook events (checkout.session.completed, invoice.paid, etc.)
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid signature
 */
router.post('/webhook', paymentController.webhook);

/**
 * @swagger
 * /api/v1/transactions:
 *   get:
 *     summary: Get transaction history
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Paginated transaction list
 */
router.get('/transactions', authenticate, validate(getTransactionsQuerySchema), paymentController.getTransactions);

module.exports = router;
