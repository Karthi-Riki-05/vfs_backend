const express = require('express');
const router = express.Router();
const issueController = require('../controllers/issue.controller');
const { authenticate } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate');
const { createIssueSchema, updateIssueSchema, getIssuesQuerySchema, idParamSchema } = require('../validators/issue.validator');

router.use(authenticate);

/**
 * @swagger
 * /api/v1/issues:
 *   get:
 *     summary: List issues for user's flows
 *     tags: [Issues]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: flowId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Paginated list of issues
 */
router.get('/', validate(getIssuesQuerySchema), issueController.getIssues);

/**
 * @swagger
 * /api/v1/issues:
 *   post:
 *     summary: Create an issue on a flow item
 *     tags: [Issues]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, flowId]
 *             properties:
 *               title:
 *                 type: string
 *               flowId:
 *                 type: integer
 *               flowItemId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Issue created
 */
router.post('/', validate(createIssueSchema), issueController.createIssue);

/**
 * @swagger
 * /api/v1/issues/{id}:
 *   get:
 *     summary: Get issue by ID
 *     tags: [Issues]
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
 *         description: Issue details
 *       404:
 *         description: Issue not found
 */
router.get('/:id', validate(idParamSchema), issueController.getIssueById);

/**
 * @swagger
 * /api/v1/issues/{id}:
 *   put:
 *     summary: Update an issue
 *     tags: [Issues]
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
 *               title:
 *                 type: string
 *               isChecked:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Issue updated
 */
router.put('/:id', validate(updateIssueSchema), issueController.updateIssue);

/**
 * @swagger
 * /api/v1/issues/{id}:
 *   delete:
 *     summary: Delete an issue
 *     tags: [Issues]
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
 *         description: Issue deleted
 */
router.delete('/:id', validate(idParamSchema), issueController.deleteIssue);

module.exports = router;
