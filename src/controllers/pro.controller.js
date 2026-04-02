const proService = require('../services/pro.service');
const asyncHandler = require('../utils/asyncHandler');

class ProController {
    getAppStatus = asyncHandler(async (req, res) => {
        const result = await proService.getAppStatus(req.user.id);
        res.json({ success: true, data: result });
    });

    switchApp = asyncHandler(async (req, res) => {
        const result = await proService.switchApp(req.user.id, req.body.app);
        res.json({ success: true, data: result });
    });

    purchasePro = asyncHandler(async (req, res) => {
        const result = await proService.createProPurchaseCheckout(req.user.id);
        res.json({ success: true, data: result });
    });

    buyFlows = asyncHandler(async (req, res) => {
        const result = await proService.createFlowPurchaseCheckout(req.user.id, req.body.package);
        res.json({ success: true, data: result });
    });

    getSubscriptionStatus = asyncHandler(async (req, res) => {
        const result = await proService.getProSubscriptionStatus(req.user.id);
        res.json({ success: true, data: result });
    });

    getFlowPricing = asyncHandler(async (req, res) => {
        const pricing = proService.getFlowPricing();
        res.json({ success: true, data: pricing });
    });

    verifyPurchase = asyncHandler(async (req, res) => {
        console.log('[ProController.verifyPurchase] session_id:', req.query.session_id, 'userId:', req.user.id);
        const result = await proService.verifyPurchase(req.user.id, req.query.session_id);
        res.json({ success: true, data: result });
    });
}

module.exports = new ProController();
