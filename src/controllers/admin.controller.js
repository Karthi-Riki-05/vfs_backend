const adminService = require('../services/admin.service');
const asyncHandler = require('../utils/asyncHandler');

class AdminController {
    getUsers = asyncHandler(async (req, res) => {
        const result = await adminService.getUsers(req.query);
        res.json({ success: true, data: result });
    });

    updateUser = asyncHandler(async (req, res) => {
        const user = await adminService.updateUser(req.params.id, req.body);
        res.json({ success: true, data: user });
    });

    getPlans = asyncHandler(async (req, res) => {
        const plans = await adminService.getPlans();
        res.json({ success: true, data: plans });
    });

    createPlan = asyncHandler(async (req, res) => {
        const plan = await adminService.createPlan(req.body);
        res.status(201).json({ success: true, data: plan });
    });

    updatePlan = asyncHandler(async (req, res) => {
        const plan = await adminService.updatePlan(req.params.id, req.body);
        res.json({ success: true, data: plan });
    });

    getSubscriptions = asyncHandler(async (req, res) => {
        const result = await adminService.getSubscriptions(req.query);
        res.json({ success: true, data: result });
    });

    getTransactions = asyncHandler(async (req, res) => {
        const result = await adminService.getTransactions(req.query);
        res.json({ success: true, data: result });
    });

    getFeedback = asyncHandler(async (req, res) => {
        const result = await adminService.getFeedback(req.query);
        res.json({ success: true, data: result });
    });

    getOffers = asyncHandler(async (req, res) => {
        const offers = await adminService.getOffers();
        res.json({ success: true, data: offers });
    });

    createOffer = asyncHandler(async (req, res) => {
        const offer = await adminService.createOffer(req.body);
        res.status(201).json({ success: true, data: offer });
    });

    updateOffer = asyncHandler(async (req, res) => {
        const offer = await adminService.updateOffer(req.params.id, req.body);
        res.json({ success: true, data: offer });
    });

    deleteOffer = asyncHandler(async (req, res) => {
        await adminService.deleteOffer(req.params.id);
        res.json({ success: true, data: { message: 'Offer deleted successfully' } });
    });

    createPromoCode = asyncHandler(async (req, res) => {
        const promo = await adminService.createPromoCode(req.body);
        res.status(201).json({ success: true, data: promo });
    });

    getStats = asyncHandler(async (req, res) => {
        const stats = await adminService.getStats();
        res.json({ success: true, data: stats });
    });
}

module.exports = new AdminController();
