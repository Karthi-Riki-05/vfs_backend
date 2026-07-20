const paymentService = require("../services/payment.service");
const asyncHandler = require("../utils/asyncHandler");

class PaymentController {
  createCheckout = asyncHandler(async (req, res) => {
    const result = await paymentService.createCheckoutSession(
      req.user.id,
      req.body.planId,
      { successUrl: req.body.successUrl, cancelUrl: req.body.cancelUrl },
    );
    res.json({ success: true, data: result });
  });

  webhook = asyncHandler(async (req, res) => {
    const signature = req.headers["stripe-signature"];
    const result = await paymentService.handleWebhook(req.rawBody, signature);
    res.json(result);
  });

  getTransactions = asyncHandler(async (req, res) => {
    const result = await paymentService.getTransactions(req.user.id, req.query);
    res.json({ success: true, data: result });
  });

  setupIntent = asyncHandler(async (req, res) => {
    const result = await paymentService.createSetupIntent(req.user.id);
    res.json({ success: true, data: result });
  });

  listPaymentMethods = asyncHandler(async (req, res) => {
    const result = await paymentService.listPaymentMethods(req.user.id);
    res.json({ success: true, data: result });
  });

  checkDuplicateCard = asyncHandler(async (req, res) => {
    const result = await paymentService.checkDuplicateCard(
      req.user.id,
      req.body.paymentMethodId,
    );
    res.json({ success: true, data: result });
  });

  setDefaultCard = asyncHandler(async (req, res) => {
    const { paymentMethodId } = req.body;
    if (!paymentMethodId) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "paymentMethodId is required",
        },
      });
    }
    const result = await paymentService.setDefaultCard(
      req.user.id,
      paymentMethodId,
    );
    res.json({ success: true, data: result });
  });

  removeCard = asyncHandler(async (req, res) => {
    const { paymentMethodId, cancelRecurring } = req.query;
    if (!paymentMethodId) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "paymentMethodId is required",
        },
      });
    }
    try {
      const result = await paymentService.removeCard(
        req.user.id,
        paymentMethodId,
        cancelRecurring === "true",
      );
      res.json({ success: true, data: result });
    } catch (err) {
      if (err.code === "DEFAULT_CARD_ACTIVE_SUB") {
        return res.status(400).json({
          success: false,
          error: {
            code: err.code,
            message: err.message,
            subscriptionExpiry: err.subscriptionExpiry || null,
            flowAddonExpiry: err.flowAddonExpiry || null,
          },
        });
      }
      throw err;
    }
  });

  stripeConfig = asyncHandler(async (req, res) => {
    const key =
      process.env.STRIPE_PUBLISHABLE_KEY ||
      process.env.STRIPE_LIVE_PUBLISHABLE_KEY ||
      null;
    if (!key) {
      return res.status(503).json({
        success: false,
        error: { code: "CONFIG_ERROR", message: "Stripe not configured" },
      });
    }
    res.json({ success: true, data: { publishableKey: key } });
  });
}

module.exports = new PaymentController();
