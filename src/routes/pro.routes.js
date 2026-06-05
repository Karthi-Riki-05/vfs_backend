const express = require("express");
const router = express.Router();
const proController = require("../controllers/pro.controller");
const { authenticate } = require("../middleware/auth.middleware");
const validate = require("../middleware/validate");
const {
  switchAppSchema,
  buyFlowsSchema,
} = require("../validators/pro.validator");

// App status (current app, pro status, flow usage)
router.get("/app-status", authenticate, proController.getAppStatus);

// Grant Pro from the Pro app (App Store / Play Store purchase). Called
// automatically by ProGuard when the user is in ?app=pro context — no Stripe
// charge. The ?app=pro URL is trusted as proof of purchase (product decision),
// so no WebView/mobile guard here; the grant is idempotent (one 200-credit
// grant per account, re-grant is a no-op). `authenticate` is still required.
// NOTE: mobileAppOnly.js is kept in the codebase for potential future use.
router.post("/grant-from-mobile", authenticate, proController.grantFromMobile);

// Switch between free and pro apps
router.put(
  "/switch-app",
  authenticate,
  validate(switchAppSchema),
  proController.switchApp,
);

// Purchase Pro ($1 one-time)
router.post("/purchase", authenticate, proController.purchasePro);
// Alias: tests and older clients may use /checkout
router.post("/checkout", authenticate, proController.purchasePro);

// Buy extra flows (Pro only)
router.post(
  "/buy-flows",
  authenticate,
  validate(buyFlowsSchema),
  proController.buyFlows,
);

// Get flow pricing options
router.get("/flow-pricing", authenticate, proController.getFlowPricing);

// Get Pro subscription status (flow usage, purchases)
router.get(
  "/subscription-status",
  authenticate,
  proController.getSubscriptionStatus,
);

// Verify purchase (safety net — activates Pro if webhook was slow)
router.get("/verify-purchase", authenticate, proController.verifyPurchase);
// Alias: tests and older clients may use /verify
router.get("/verify", authenticate, proController.verifyPurchase);

// Verify flow-pack purchase (safety net for extra-flows pack)
router.get(
  "/verify-flow-purchase",
  authenticate,
  proController.verifyExtraFlowsPurchase,
);

// Flow Add-on subscription (recurring monthly)
router.post(
  "/flow-addon/checkout",
  authenticate,
  proController.createFlowAddonCheckout,
);
router.post("/flow-addon/cancel", authenticate, proController.cancelFlowAddon);
router.get(
  "/flow-addon/status",
  authenticate,
  proController.getFlowAddonStatus,
);

module.exports = router;
