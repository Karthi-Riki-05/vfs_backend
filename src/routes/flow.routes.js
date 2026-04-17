const express = require("express");
const router = express.Router();
const flowController = require("../controllers/flow.controller");
const { authenticate } = require("../middleware/auth.middleware");
const validate = require("../middleware/validate");
const {
  createFlowSchema,
  updateFlowSchema,
  updateDiagramStateSchema,
  getFlowsQuerySchema,
  idParamSchema,
  shareFlowSchema,
  updateShareSchema,
  shareIdParamSchema,
} = require("../validators/flow.validator");

// All flow routes are protected
router.use(authenticate);

// AI: generate VSM diagram from uploaded PDF/Word — must be before /:id matchers
router.post("/ai-from-doc", flowController.generateFromDocument);

// Version history
router.get(
  "/:id/versions",
  validate(idParamSchema),
  flowController.getFlowVersions,
);
router.post(
  "/:id/versions/restore/:versionId",
  validate(idParamSchema),
  flowController.restoreFlowVersion,
);

/**
 * @swagger
 * /api/v1/flows:
 *   get:
 *     summary: Get all flows for the authenticated user
 *     tags: [Flows]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for flow name or description
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *     responses:
 *       200:
 *         description: List of flows with pagination
 *       401:
 *         description: Unauthorized
 */
router.get("/", validate(getFlowsQuerySchema), flowController.getAllFlows);

router.get("/favorites", flowController.getFavorites);
router.get("/trash", flowController.getTrash);
router.get("/share/members", flowController.getAvailableShareMembers);

/**
 * @swagger
 * /api/v1/flows/{id}:
 *   get:
 *     summary: Get a flow by ID
 *     tags: [Flows]
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
 *         description: Flow details
 *       404:
 *         description: Flow not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", validate(idParamSchema), flowController.getFlowById);

/**
 * @swagger
 * /api/v1/flows:
 *   post:
 *     summary: Create a new flow
 *     tags: [Flows]
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
 *               description:
 *                 type: string
 *               diagramData:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Flow created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post("/", validate(createFlowSchema), flowController.createFlow);

/**
 * @swagger
 * /api/v1/flows/{id}:
 *   put:
 *     summary: Update a flow
 *     tags: [Flows]
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
 *               description:
 *                 type: string
 *               diagramData:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Flow updated
 *       401:
 *         description: Unauthorized
 */
router.put("/:id", validate(updateFlowSchema), flowController.updateFlow);

/**
 * @swagger
 * /api/v1/flows/{id}/diagram:
 *   put:
 *     summary: Update diagram state of a flow
 *     tags: [Flows]
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
 *             required: [groupId, newShape]
 *             properties:
 *               groupId:
 *                 type: string
 *               newShape:
 *                 type: object
 *     responses:
 *       200:
 *         description: Diagram state updated
 *       401:
 *         description: Unauthorized
 */
router.put(
  "/:id/diagram",
  validate(updateDiagramStateSchema),
  flowController.updateDiagramState,
);

/**
 * @swagger
 * /api/v1/flows/{id}:
 *   delete:
 *     summary: Delete a flow
 *     tags: [Flows]
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
 *         description: Flow deleted
 *       401:
 *         description: Unauthorized
 */
router.delete("/:id", validate(idParamSchema), flowController.deleteFlow);

/**
 * @swagger
 * /api/v1/flows/{id}/duplicate:
 *   post:
 *     summary: Duplicate a flow
 *     tags: [Flows]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Flow duplicated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Flow not found
 */
router.post(
  "/:id/duplicate",
  validate(idParamSchema),
  flowController.duplicateFlow,
);

router.post(
  "/:id/restore",
  validate(idParamSchema),
  flowController.restoreFlow,
);

router.delete(
  "/:id/permanent",
  validate(idParamSchema),
  flowController.permanentDeleteFlow,
);

// ==================== SHARING ROUTES ====================

// Share a flow with users
router.post("/:id/share", validate(shareFlowSchema), flowController.shareFlow);

// Get all shares for a flow
router.get(
  "/:id/shares",
  validate(idParamSchema),
  flowController.getFlowShares,
);

// Update share permission
router.put(
  "/:id/shares/:shareId",
  validate(updateShareSchema),
  flowController.updateShare,
);

// Remove a share
router.delete(
  "/:id/shares/:shareId",
  validate(shareIdParamSchema),
  flowController.removeShare,
);

module.exports = router;
