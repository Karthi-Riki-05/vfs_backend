const paymentService = require('../services/payment.service');
const asyncHandler = require('../utils/asyncHandler');

class PaymentController {
    createCheckout = asyncHandler(async (req, res) => {
        const result = await paymentService.createCheckoutSession(
            req.user.id,
            req.body.planId,
            { successUrl: req.body.successUrl, cancelUrl: req.body.cancelUrl }
        );
        res.json({ success: true, data: result });
    });

    webhook = asyncHandler(async (req, res) => {
        const signature = req.headers['stripe-signature'];
        const result = await paymentService.handleWebhook(req.rawBody, signature);
        res.json(result);
    });

    getTransactions = asyncHandler(async (req, res) => {
        const result = await paymentService.getTransactions(req.user.id, req.query);
        res.json({ success: true, data: result });
    });
}

module.exports = new PaymentController();
