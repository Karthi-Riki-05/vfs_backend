const express = require('express');
const router = express.Router();
const proController = require('../controllers/pro.controller');
const { authenticate } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate');
const { switchAppSchema, buyFlowsSchema } = require('../validators/pro.validator');

// App status (current app, pro status, flow usage)
router.get('/app-status', authenticate, proController.getAppStatus);

// Switch between free and pro apps
router.put('/switch-app', authenticate, validate(switchAppSchema), proController.switchApp);

// Purchase Pro ($1 one-time)
router.post('/purchase', authenticate, proController.purchasePro);

// Buy extra flows (Pro only)
router.post('/buy-flows', authenticate, validate(buyFlowsSchema), proController.buyFlows);

// Get flow pricing options
router.get('/flow-pricing', authenticate, proController.getFlowPricing);

// Get Pro subscription status (flow usage, purchases)
router.get('/subscription-status', authenticate, proController.getSubscriptionStatus);

// Verify purchase (safety net — activates Pro if webhook was slow)
router.get('/verify-purchase', authenticate, proController.verifyPurchase);

module.exports = router;
