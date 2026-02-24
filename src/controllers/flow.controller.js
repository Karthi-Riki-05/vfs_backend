const flowService = require('../services/flow.service');

class FlowController {
    async getAllFlows(req, res) {
        try {
            const userId = req.user.id; // From auth middleware
            const { search, page, limit } = req.query;
            const result = await flowService.getAllFlows(userId, { search, page, limit });
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getFlowById(req, res) {
        try {
            const userId = req.user.id;
            const flow = await flowService.getFlowById(req.params.id, userId);
            if (!flow) return res.status(404).json({ error: 'Flow not found' });
            res.json(flow);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async createFlow(req, res) {
        try {
            const userId = req.user.id;
            const flow = await flowService.createFlow(userId, req.body);
            res.status(201).json(flow);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async updateFlow(req, res) {
        try {
            const userId = req.user.id;

            await flowService.updateFlow(req.params.id, userId, req.body);
            res.json({ message: 'Flow updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    

    async deleteFlow(req, res) {
        try {
            const userId = req.user.id;
            await flowService.deleteFlow(req.params.id, userId);
            res.json({ message: 'Flow deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async duplicateFlow(req, res) {
        try {
            const userId = req.user.id;
            const flow = await flowService.duplicateFlow(req.params.id, userId);
            res.status(201).json(flow);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async updateDiagramState(req, res) {
        try {
            const userId = req.user.id;
            const { groupId, newShape } = req.body;
            const updatedDiagram = await flowService.updateDiagramState(req.params.id, userId, groupId, newShape);
            res.json(updatedDiagram);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new FlowController();
