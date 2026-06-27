const shapeService = require("../services/shape.service");
const asyncHandler = require("../utils/asyncHandler");

class ShapeController {
  getAllShapes = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const teamId = req.query.teamId || req.headers["x-team-context"] || null;
    const shapes = await shapeService.getAllShapes(userId, appContext, teamId);
    res.json({ success: true, data: shapes });
  });

  getShapeById = asyncHandler(async (req, res) => {
    const shape = await shapeService.getShapeById(req.params.id, req.user.id);
    if (!shape) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Shape not found" },
      });
    }
    res.json({ success: true, data: shape });
  });

  createShape = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const teamId = req.body?.teamId || req.headers["x-team-context"] || null;
    const shape = await shapeService.createShape(
      userId,
      { ...req.body, teamId },
      appContext,
    );
    res.status(201).json({ success: true, data: shape });
  });

  updateShape = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    await shapeService.updateShape(req.params.id, userId, req.body);
    res.json({
      success: true,
      data: { message: "Shape updated successfully" },
    });
  });

  deleteShape = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    await shapeService.deleteShape(req.params.id, userId);
    res.json({
      success: true,
      data: { message: "Shape deleted successfully" },
    });
  });

  getCategories = asyncHandler(async (req, res) => {
    const categories = await shapeService.getCategories();
    res.json({ success: true, data: categories });
  });

  associateTeam = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const result = await shapeService.associateTeam(
      req.params.shapeId,
      req.user.id,
      req.body.teamId,
      req.body.shape,
      appContext,
    );
    res.json({ success: true, data: result });
  });

  associateGroup = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const result = await shapeService.associateGroup(
      req.params.shapeId,
      req.user.id,
      req.body.groupId,
      req.body.shape,
      appContext,
    );
    res.json({ success: true, data: result });
  });

  removeAssociation = asyncHandler(async (req, res) => {
    await shapeService.removeAssociation(req.params.shapeId, req.user.id);
    res.json({
      success: true,
      data: { message: "Association removed successfully" },
    });
  });

  getAssociation = asyncHandler(async (req, res) => {
    const association = await shapeService.getAssociation(
      req.params.shapeId,
      req.user.id,
    );
    res.json({ success: true, data: association });
  });

  checkAssociations = asyncHandler(async (req, res) => {
    const associations = await shapeService.checkAssociations(
      req.body.shapeIds,
      req.user.id,
    );
    res.json({ success: true, data: associations });
  });

  copyShape = asyncHandler(async (req, res) => {
    const copy = await shapeService.copyShape(req.user.id, req.params.id);
    res.status(201).json({ success: true, data: copy });
  });

  bulkDelete = asyncHandler(async (req, res) => {
    const result = await shapeService.bulkDelete(
      req.body.shapeIds,
      req.user.id,
    );
    res.json({ success: true, data: result });
  });
}

module.exports = new ShapeController();
