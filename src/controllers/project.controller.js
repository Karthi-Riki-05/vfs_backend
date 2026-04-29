const projectService = require("../services/project.service");
const asyncHandler = require("../utils/asyncHandler");

class ProjectController {
  getAllProjects = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    // Active workspace: team header takes precedence over the user's
    // billing-tier currentVersion. Personal projects scope to teamId=null.
    const teamId = req.query.teamId || req.headers["x-team-context"] || null;
    const appContext = teamId ? "team" : req.user.currentVersion || "free";
    const { search } = req.query;
    const projects = await projectService.getAllProjects(
      userId,
      { search, teamId },
      appContext,
    );
    res.json({ success: true, data: projects });
  });

  getProjectById = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const project = await projectService.getProjectWithFlows(
      req.params.id,
      userId,
      req.query,
    );
    res.json({ success: true, data: project });
  });

  createProject = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const teamId = req.body?.teamId || req.headers["x-team-context"] || null;
    const appContext = teamId ? "team" : req.user.currentVersion || "free";
    const project = await projectService.createProject(
      userId,
      { ...req.body, teamId },
      appContext,
    );
    res.status(201).json({ success: true, data: project });
  });

  updateProject = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const project = await projectService.updateProject(
      req.params.id,
      userId,
      req.body,
    );
    res.json({ success: true, data: project });
  });

  deleteProject = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    await projectService.deleteProject(req.params.id, userId);
    res.json({
      success: true,
      data: { message: "Project deleted successfully" },
    });
  });

  assignFlow = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const flow = await projectService.assignFlow(
      req.params.id,
      userId,
      req.body.flowId,
    );
    res.json({ success: true, data: flow });
  });

  unassignFlow = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const flow = await projectService.unassignFlow(
      req.params.id,
      userId,
      req.body.flowId,
    );
    res.json({ success: true, data: flow });
  });
}

module.exports = new ProjectController();
