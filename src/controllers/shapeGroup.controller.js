const shapeGroupService = require('../services/shapeGroup.service');

class ShapeGroupController {
    async getAllGroups(req, res) {
        try {
            const userId = req.user.id;
            const groups = await shapeGroupService.getAllGroups(userId);
            res.json(groups);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to fetch shape groups' });
        }
    }

    async createGroup(req, res) {
        try {
            const userId = req.user.id;
            const group = await shapeGroupService.createGroup(userId, req.body);
            res.status(201).json(group);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to create shape group' });
        }
    }
}

module.exports = new ShapeGroupController();
