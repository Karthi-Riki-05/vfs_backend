const express = require('express');
const router = express.Router();
const shapeController = require('../controllers/shape.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/', shapeController.getAllShapes);
router.get('/categories', shapeController.getCategories);
router.get('/:id', shapeController.getShapeById);
router.post('/', shapeController.createShape);
router.put('/:id', shapeController.updateShape);
router.delete('/:id', shapeController.deleteShape);

module.exports = router;
