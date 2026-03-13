const flowService = require('../services/flow.service');
const asyncHandler = require('../utils/asyncHandler');

class FlowController {
    getAllFlows = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const appContext = req.user.currentVersion || 'free';
        const { search, page, limit, nonEmpty, draftsOnly } = req.query;
        const result = await flowService.getAllFlows(userId, { search, page, limit, nonEmpty, draftsOnly }, appContext);
        const shared = await flowService.getSharedFlows(userId, appContext);
        res.json({ success: true, data: { ...result, shared } });
    });

    getFlowById = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const flow = await flowService.getFlowByIdWithAccess(req.params.id, userId);
        if (!flow) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Flow not found' } });
        }
        res.json({ success: true, data: flow });
    });

    createFlow = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const appContext = req.user.currentVersion || 'free';
        const flow = await flowService.createFlow(userId, req.body, appContext);
        res.status(201).json({ success: true, data: flow });
    });

    updateFlow = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        await flowService.updateFlowWithAccess(req.params.id, userId, req.body);
        res.json({ success: true, data: { message: 'Flow updated successfully' } });
    });

    deleteFlow = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        await flowService.deleteFlow(req.params.id, userId);
        res.json({ success: true, data: { message: 'Flow deleted successfully' } });
    });

    duplicateFlow = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const appContext = req.user.currentVersion || 'free';
        const flow = await flowService.duplicateFlow(req.params.id, userId, appContext);
        res.status(201).json({ success: true, data: flow });
    });

    updateDiagramState = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const { groupId, newShape } = req.body;
        const updatedDiagram = await flowService.updateDiagramState(req.params.id, userId, groupId, newShape);
        res.json({ success: true, data: updatedDiagram });
    });

    getFavorites = asyncHandler(async (req, res) => {
        const appContext = req.user.currentVersion || 'free';
        const flows = await flowService.getFavorites(req.user.id, appContext);
        res.json({ success: true, data: flows });
    });

    getTrash = asyncHandler(async (req, res) => {
        const appContext = req.user.currentVersion || 'free';
        const result = await flowService.getTrash(req.user.id, req.query, appContext);
        res.json({ success: true, data: result });
    });

    restoreFlow = asyncHandler(async (req, res) => {
        await flowService.restoreFlow(req.params.id, req.user.id);
        res.json({ success: true, data: { message: 'Flow restored successfully' } });
    });

    permanentDeleteFlow = asyncHandler(async (req, res) => {
        await flowService.permanentDeleteFlow(req.params.id, req.user.id);
        res.json({ success: true, data: { message: 'Flow permanently deleted' } });
    });

    // ==================== SHARING ====================

    shareFlow = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const appContext = req.user.currentVersion || 'free';
        const results = await flowService.shareFlow(req.params.id, userId, req.body.shares, appContext);
        res.json({ success: true, data: results });
    });

    getFlowShares = asyncHandler(async (req, res) => {
        const shares = await flowService.getFlowShares(req.params.id, req.user.id);
        res.json({ success: true, data: shares });
    });

    updateShare = asyncHandler(async (req, res) => {
        await flowService.updateShare(req.params.id, req.params.shareId, req.user.id, req.body.permission);
        res.json({ success: true, data: { message: 'Permission updated' } });
    });

    removeShare = asyncHandler(async (req, res) => {
        await flowService.removeShare(req.params.id, req.params.shareId, req.user.id);
        res.json({ success: true, data: { message: 'Share removed' } });
    });

    getAvailableShareMembers = asyncHandler(async (req, res) => {
        const members = await flowService.getAvailableShareMembers(req.user.id);
        res.json({ success: true, data: members });
    });

    getAllFlowsWithShared = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const appContext = req.user.currentVersion || 'free';
        const { search, page, limit, nonEmpty, draftsOnly } = req.query;
        const own = await flowService.getAllFlows(userId, { search, page, limit, nonEmpty, draftsOnly }, appContext);
        const shared = await flowService.getSharedFlows(userId, appContext);
        res.json({ success: true, data: { ...own, shared } });
    });

    getFlowByIdWithAccess = asyncHandler(async (req, res) => {
        const flow = await flowService.getFlowByIdWithAccess(req.params.id, req.user.id);
        if (!flow) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Flow not found' } });
        }
        res.json({ success: true, data: flow });
    });

    updateFlowWithAccess = asyncHandler(async (req, res) => {
        await flowService.updateFlowWithAccess(req.params.id, req.user.id, req.body);
        res.json({ success: true, data: { message: 'Flow updated successfully' } });
    });

    duplicateSharedFlow = asyncHandler(async (req, res) => {
        const appContext = req.user.currentVersion || 'free';
        const flow = await flowService.duplicateSharedFlow(req.params.id, req.user.id, appContext);
        res.status(201).json({ success: true, data: flow });
    });
}

module.exports = new FlowController();
