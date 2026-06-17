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
// DEPRECATED (System A — one-time 30-day packs). Soft-retired in favor of
// the recurring flow add-on (/flow-addon/checkout): blocked while an add-on
// is active (ADDON_SUBSCRIPTION_ACTIVE), no UI button. Kept only so users
// without an add-on can still renew until hard removal after 2026-12-31.
// See FLOWPACK_AUDIT.md "System A Retirement Plan".
router.post(
  "/buy-flows",
  authenticate,
  (req, res, next) => {
    res.set("Deprecation", "true");
    res.set("Sunset", "Thu, 31 Dec 2026 23:59:59 GMT");
    next();
  },
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
// Safety net — activates the add-on if the checkout webhook was lost
router.post(
  "/verify-flow-addon",
  authenticate,
  proController.verifyFlowAddonCheckout,
);

module.exports = router;
