const shapeService = require('../services/shape.service');

class ShapeController {
    async getAllShapes(req, res) {
        try {
            const userId = req.user.id;
            const shapes = await shapeService.getAllShapes(userId);
            res.json(shapes);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getShapeById(req, res) {
        try {
            const shape = await shapeService.getShapeById(req.params.id);
            if (!shape) return res.status(404).json({ error: 'Shape not found' });
            res.json(shape);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async createShape(req, res) {
        try {
            const userId = req.user.id;
            const shape = await shapeService.createShape(userId, req.body);
            res.status(201).json(shape);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async updateShape(req, res) {
        try {
            const userId = req.user.id;
            await shapeService.updateShape(req.params.id, userId, req.body);
            res.json({ message: 'Shape updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async deleteShape(req, res) {
        try {
            const userId = req.user.id;
            await shapeService.deleteShape(req.params.id, userId);
            res.json({ message: 'Shape deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getCategories(req, res) {
        try {
            const categories = await shapeService.getCategories();
            res.json(categories);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new ShapeController();
