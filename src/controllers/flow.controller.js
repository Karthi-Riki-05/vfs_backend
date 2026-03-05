const flowService = require('../services/flow.service');
const asyncHandler = require('../utils/asyncHandler');

class FlowController {
    getAllFlows = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const { search, page, limit } = req.query;
        const result = await flowService.getAllFlows(userId, { search, page, limit });
        res.json({ success: true, data: result });
    });

    getFlowById = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const flow = await flowService.getFlowById(req.params.id, userId);
        if (!flow) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Flow not found' } });
        }
        res.json({ success: true, data: flow });
    });

    createFlow = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const flow = await flowService.createFlow(userId, req.body);
        res.status(201).json({ success: true, data: flow });
    });

    updateFlow = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        await flowService.updateFlow(req.params.id, userId, req.body);
        res.json({ success: true, data: { message: 'Flow updated successfully' } });
    });

    deleteFlow = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        await flowService.deleteFlow(req.params.id, userId);
        res.json({ success: true, data: { message: 'Flow deleted successfully' } });
    });

    duplicateFlow = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const flow = await flowService.duplicateFlow(req.params.id, userId);
        res.status(201).json({ success: true, data: flow });
    });

    updateDiagramState = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const { groupId, newShape } = req.body;
        const updatedDiagram = await flowService.updateDiagramState(req.params.id, userId, groupId, newShape);
        res.json({ success: true, data: updatedDiagram });
    });

    getFavorites = asyncHandler(async (req, res) => {
        const flows = await flowService.getFavorites(req.user.id);
        res.json({ success: true, data: flows });
    });

    getTrash = asyncHandler(async (req, res) => {
        const result = await flowService.getTrash(req.user.id, req.query);
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
}

module.exports = new FlowController();
