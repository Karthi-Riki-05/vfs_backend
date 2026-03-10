const projectService = require('../services/project.service');
const asyncHandler = require('../utils/asyncHandler');

class ProjectController {
    getAllProjects = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const appContext = req.user.currentVersion || 'free';
        const { search } = req.query;
        const projects = await projectService.getAllProjects(userId, { search }, appContext);
        res.json({ success: true, data: projects });
    });

    getProjectById = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const appContext = req.user.currentVersion || 'free';
        const project = await projectService.getProjectWithFlows(req.params.id, userId, req.query, appContext);
        res.json({ success: true, data: project });
    });

    createProject = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const appContext = req.user.currentVersion || 'free';
        const project = await projectService.createProject(userId, req.body, appContext);
        res.status(201).json({ success: true, data: project });
    });

    updateProject = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const project = await projectService.updateProject(req.params.id, userId, req.body);
        res.json({ success: true, data: project });
    });

    deleteProject = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        await projectService.deleteProject(req.params.id, userId);
        res.json({ success: true, data: { message: 'Project deleted successfully' } });
    });

    assignFlow = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const flow = await projectService.assignFlow(req.params.id, userId, req.body.flowId);
        res.json({ success: true, data: flow });
    });

    unassignFlow = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        const flow = await projectService.unassignFlow(req.params.id, userId, req.body.flowId);
        res.json({ success: true, data: flow });
    });
}

module.exports = new ProjectController();
