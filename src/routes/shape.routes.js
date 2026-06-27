const express = require("express");
const router = express.Router();
const shapeController = require("../controllers/shape.controller");
const { authenticate } = require("../middleware/auth.middleware");
const validate = require("../middleware/validate");
const {
  createShapeSchema,
  updateShapeSchema,
  idParamSchema,
  associateTeamSchema,
  associateGroupSchema,
  shapeIdParamSchema,
  checkAssociationsSchema,
  bulkDeleteSchema,
} = require("../validators/shape.validator");

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
router.get("/", shapeController.getAllShapes);

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
router.get("/categories", shapeController.getCategories);

/**
 * @swagger
 * /api/v1/shapes/check-associations:
 *   post:
 *     summary: Check which of the provided shape IDs have team/group associations
 *     tags: [Shapes]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shapeIds]
 *             properties:
 *               shapeIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: List of associated shapes with their team/group details
 */
router.post(
  "/check-associations",
  validate(checkAssociationsSchema),
  shapeController.checkAssociations,
);

/**
 * @swagger
 * /api/v1/shapes/bulk-delete:
 *   delete:
 *     summary: Soft delete multiple shapes and remove their associations
 *     tags: [Shapes]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shapeIds]
 *             properties:
 *               shapeIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Shapes soft-deleted, associations cleared
 */
// NOTE: registered BEFORE '/:id' so 'bulk-delete' is never captured as an id.
router.delete(
  "/bulk-delete",
  validate(bulkDeleteSchema),
  shapeController.bulkDelete,
);

/**
 * @swagger
 * /api/v1/shapes/{id}/copy:
 *   post:
 *     summary: Duplicate a shape owned by the requesting user
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
 *       201:
 *         description: Duplicate shape created
 *       403:
 *         description: Not the owner of this shape
 *       404:
 *         description: Shape not found
 */
router.post("/:id/copy", validate(idParamSchema), shapeController.copyShape);

/**
 * @swagger
 * /api/v1/shapes/{shapeId}/associate-team:
 *   post:
 *     summary: Associate a shape with a team (adds it to the team shape library)
 *     tags: [Shapes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shapeId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [teamId]
 *             properties:
 *               teamId:
 *                 type: string
 *               shape:
 *                 type: object
 *                 description: Inline shape data — creates the Shape row if shapeId does not exist yet
 *     responses:
 *       200:
 *         description: Shape associated with team
 *       404:
 *         description: Team or shape not found
 */
router.post(
  "/:shapeId/associate-team",
  validate(associateTeamSchema),
  shapeController.associateTeam,
);

/**
 * @swagger
 * /api/v1/shapes/{shapeId}/associate-group:
 *   post:
 *     summary: Associate a shape with a chat group
 *     tags: [Shapes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shapeId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [groupId]
 *             properties:
 *               groupId:
 *                 type: string
 *               shape:
 *                 type: object
 *     responses:
 *       200:
 *         description: Shape associated with chat group
 */
router.post(
  "/:shapeId/associate-group",
  validate(associateGroupSchema),
  shapeController.associateGroup,
);

/**
 * @swagger
 * /api/v1/shapes/{shapeId}/remove-association:
 *   delete:
 *     summary: Remove any team/group association from a shape
 *     tags: [Shapes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shapeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Association removed
 */
router.delete(
  "/:shapeId/remove-association",
  validate(shapeIdParamSchema),
  shapeController.removeAssociation,
);

/**
 * @swagger
 * /api/v1/shapes/{shapeId}/association:
 *   get:
 *     summary: Get the current team/group association of a shape
 *     tags: [Shapes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shapeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Association details (type is null when unassociated)
 */
router.get(
  "/:shapeId/association",
  validate(shapeIdParamSchema),
  shapeController.getAssociation,
);

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
router.get("/:id", validate(idParamSchema), shapeController.getShapeById);

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
router.post("/", validate(createShapeSchema), shapeController.createShape);

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
router.put("/:id", validate(updateShapeSchema), shapeController.updateShape);

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
router.delete("/:id", validate(idParamSchema), shapeController.deleteShape);

module.exports = router;
