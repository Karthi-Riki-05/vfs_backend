const proService = require("../services/pro.service");
const asyncHandler = require("../utils/asyncHandler");
const { workspaceHeader } = require("../lib/workspaceContext");

class ProController {
  getAppStatus = asyncHandler(async (req, res) => {
    // Pro entitlements are inherited from the workspace owner, so the active
    // workspace decides which allowance is reported.
    const result = await proService.getAppStatus(
      req.user.id,
      workspaceHeader(req) || null,
    );
    res.json({ success: true, data: result });
  });

  // POST /api/v1/pro/grant-from-mobile
  // Called by ProGuard ONLY inside the Flutter WebView after an App Store /
  // Play Store purchase. Grants Pro (credits + user promotion + own Pro team),
  // no Stripe charge. Protected by authenticate + mobileAppOnly. Idempotent.
  grantFromMobile = asyncHandler(async (req, res) => {
    const result = await proService.grantFromMobile(req.user.id);
    res.json({ success: true, data: result });
  });

  switchApp = asyncHandler(async (req, res) => {
    const result = await proService.switchApp(req.user.id, req.body.app);
    res.json({ success: true, data: result });
  });

  purchasePro = asyncHandler(async (req, res) => {
    const inviteToken = req.body?.inviteToken || req.query?.inviteToken || null;
    // Withdrawal-right waiver agreed at checkout. Passed straight through to
    // the Stripe session metadata so the consent is attached to the payment
    // itself — that is what gets shown as evidence if the charge is disputed.
    const waiver = req.body?.waiver || null;
    const result = await proService.createProPurchaseCheckout(
      req.user.id,
      inviteToken,
      waiver,
    );
    res.json({ success: true, data: result });
  });

  buyFlows = asyncHandler(async (req, res) => {
    const result = await proService.createFlowPurchaseCheckout(
      req.user.id,
      req.body.package,
    );
    res.json({ success: true, data: result });
  });

  getSubscriptionStatus = asyncHandler(async (req, res) => {
    const result = await proService.getProSubscriptionStatus(
      req.user.id,
      workspaceHeader(req) || null,
    );
    res.json({ success: true, data: result });
  });

  getFlowPricing = asyncHandler(async (req, res) => {
    const pricing = proService.getFlowPricing();
    res.json({ success: true, data: pricing });
  });

  verifyPurchase = asyncHandler(async (req, res) => {
    console.log(
      "[ProController.verifyPurchase] session_id:",
      req.query.session_id,
      "userId:",
      req.user.id,
    );
    const result = await proService.verifyPurchase(
      req.user.id,
      req.query.session_id,
    );
    res.json({ success: true, data: result });
  });

  verifyExtraFlowsPurchase = asyncHandler(async (req, res) => {
    const result = await proService.verifyExtraFlowsPurchase(
      req.user.id,
      req.query.session_id,
    );
    res.json({ success: true, data: result });
  });

  createFlowAddonCheckout = asyncHandler(async (req, res) => {
    const result = await proService.createFlowAddonSubscriptionCheckout(
      req.user.id,
      req.body.plan,
      req.body.paymentMethodId || null,
    );
    res.json({ success: true, data: result });
  });

  cancelFlowAddon = asyncHandler(async (req, res) => {
    const result = await proService.cancelFlowAddon(req.user.id);
    res.json({ success: true, data: result });
  });

  reactivateFlowAddon = asyncHandler(async (req, res) => {
    const result = await proService.reactivateFlowAddon(req.user.id);
    res.json({ success: true, data: result });
  });

  getFlowAddonStatus = asyncHandler(async (req, res) => {
    const result = await proService.getFlowAddonStatus(req.user.id);
    res.json({ success: true, data: result });
  });

  verifyFlowAddonCheckout = asyncHandler(async (req, res) => {
    const result = await proService.verifyFlowAddonCheckout(
      req.user.id,
      req.body.sessionId || req.query.session_id,
    );
    res.json({ success: true, data: result });
  });
}

module.exports = new ProController();
