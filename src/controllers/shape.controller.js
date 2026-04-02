const shapeService = require('../services/shape.service');
const asyncHandler = require('../utils/asyncHandler');

class ShapeController {
    getAllShapes = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const appContext = req.user.currentVersion || 'free';
        const shapes = await shapeService.getAllShapes(userId, appContext);
        res.json({ success: true, data: shapes });
    });

    getShapeById = asyncHandler(async (req, res) => {
        const shape = await shapeService.getShapeById(req.params.id);
        if (!shape) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Shape not found' } });
        }
        res.json({ success: true, data: shape });
    });

    createShape = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const appContext = req.user.currentVersion || 'free';
        const shape = await shapeService.createShape(userId, req.body, appContext);
        res.status(201).json({ success: true, data: shape });
    });

    updateShape = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        await shapeService.updateShape(req.params.id, userId, req.body);
        res.json({ success: true, data: { message: 'Shape updated successfully' } });
    });

    deleteShape = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        await shapeService.deleteShape(req.params.id, userId);
        res.json({ success: true, data: { message: 'Shape deleted successfully' } });
    });

    getCategories = asyncHandler(async (req, res) => {
        const categories = await shapeService.getCategories();
        res.json({ success: true, data: categories });
    });
}

module.exports = new ShapeController();
