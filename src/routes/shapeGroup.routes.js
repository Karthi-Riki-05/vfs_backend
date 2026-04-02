const express = require('express');
const router = express.Router();
const shapeGroupController = require('../controllers/shapeGroup.controller');
const { authenticate } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate');
const { createGroupSchema, updateGroupSchema, idParamSchema } = require('../validators/shapeGroup.validator');

router.use(authenticate);

/**
 * @swagger
 * /api/v1/shape-groups:
 *   get:
 *     summary: Get all shape groups for the authenticated user
 *     tags: [Shape Groups]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of shape groups
 *       401:
 *         description: Unauthorized
 */
router.get('/', shapeGroupController.getAllGroups);

/**
 * @swagger
 * /api/v1/shape-groups:
 *   post:
 *     summary: Create a new shape group
 *     tags: [Shape Groups]
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
 *     responses:
 *       201:
 *         description: Shape group created
 *       400:
 *         description: Validation error
 */
router.post('/', validate(createGroupSchema), shapeGroupController.createGroup);

/**
 * @swagger
 * /api/v1/shape-groups/{id}:
 *   get:
 *     summary: Get shape group with shapes
 *     tags: [Shape Groups]
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
 *         description: Shape group with shapes
 *       404:
 *         description: Not found
 */
router.get('/:id', validate(idParamSchema), shapeGroupController.getGroupById);

/**
 * @swagger
 * /api/v1/shape-groups/{id}:
 *   put:
 *     summary: Update a shape group
 *     tags: [Shape Groups]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Shape group updated
 */
router.put('/:id', validate(updateGroupSchema), shapeGroupController.updateGroup);

/**
 * @swagger
 * /api/v1/shape-groups/{id}:
 *   delete:
 *     summary: Delete a shape group
 *     tags: [Shape Groups]
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
 *         description: Shape group deleted
 */
router.delete('/:id', validate(idParamSchema), shapeGroupController.deleteGroup);

module.exports = router;
