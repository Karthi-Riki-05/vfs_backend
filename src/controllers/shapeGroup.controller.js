const shapeGroupService = require('../services/shapeGroup.service');
const asyncHandler = require('../utils/asyncHandler');

class ShapeGroupController {
    getAllGroups = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const groups = await shapeGroupService.getAllGroups(userId);
        res.json({ success: true, data: groups });
    });

    getGroupById = asyncHandler(async (req, res) => {
        const group = await shapeGroupService.getGroupById(req.params.id, req.user.id);
        res.json({ success: true, data: group });
    });

    createGroup = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const group = await shapeGroupService.createGroup(userId, req.body);
        res.status(201).json({ success: true, data: group });
    });

    updateGroup = asyncHandler(async (req, res) => {
        const group = await shapeGroupService.updateGroup(req.params.id, req.user.id, req.body);
        res.json({ success: true, data: group });
    });

    deleteGroup = asyncHandler(async (req, res) => {
        await shapeGroupService.deleteGroup(req.params.id, req.user.id);
        res.json({ success: true, data: { message: 'Shape group deleted successfully' } });
    });
}

module.exports = new ShapeGroupController();
