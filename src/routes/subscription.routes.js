const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/current', subscriptionController.getCurrentSubscription);
router.get('/plans', subscriptionController.getPlans);
router.post('/subscribe', subscriptionController.subscribe);
router.post('/cancel', subscriptionController.cancel);

module.exports = router;
