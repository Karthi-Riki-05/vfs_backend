const express = require('express');
const router = express.Router();
const shapeController = require('../controllers/shape.controller');
const { authenticate } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate');
const { createShapeSchema, updateShapeSchema, idParamSchema } = require('../validators/shape.validator');

router.use(authenticate);

/**
 * @swagger
 * /api/v1/shapes:
 *   get:
 *     summary: Get all shapes (public + user-owned)
 *     tags: [Shapes]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of shapes
 *       401:
 *         description: Unauthorized
 */
router.get('/', shapeController.getAllShapes);

/**
 * @swagger
 * /api/v1/shapes/categories:
 *   get:
 *     summary: Get all shape categories
 *     tags: [Shapes]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of categories
 */
router.get('/categories', shapeController.getCategories);

/**
 * @swagger
 * /api/v1/shapes/{id}:
 *   get:
 *     summary: Get a shape by ID
 *     tags: [Shapes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Shape details
 *       404:
 *         description: Shape not found
 */
router.get('/:id', validate(idParamSchema), shapeController.getShapeById);

/**
 * @swagger
 * /api/v1/shapes:
 *   post:
 *     summary: Create a new shape
 *     tags: [Shapes]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [stencil, image, html, shape]
 *               content:
 *                 type: string
 *               textAlignment:
 *                 type: string
 *                 enum: [top, center, bottom]
 *               groupId:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Shape created
 *       400:
 *         description: Validation error
 */
router.post('/', validate(createShapeSchema), shapeController.createShape);

/**
 * @swagger
 * /api/v1/shapes/{id}:
 *   put:
 *     summary: Update a shape
 *     tags: [Shapes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Shape updated
 */
router.put('/:id', validate(updateShapeSchema), shapeController.updateShape);

/**
 * @swagger
 * /api/v1/shapes/{id}:
 *   delete:
 *     summary: Delete a shape
 *     tags: [Shapes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Shape deleted
 */
router.delete('/:id', validate(idParamSchema), shapeController.deleteShape);

module.exports = router;
