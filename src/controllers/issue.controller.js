const issueService = require("../services/issue.service");
const asyncHandler = require("../utils/asyncHandler");
const { workspaceHeader, workspaceQuery, workspaceBody } = require("../lib/workspaceContext");

class IssueController {
  getIssues = asyncHandler(async (req, res) => {
    const workspaceId = workspaceQuery(req) || workspaceHeader(req) || null;
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const result = await issueService.getIssues(
      req.user.id,
      {
        ...req.query,
        workspaceId,
      },
      appContext,
    );
    res.json({ success: true, data: result });
  });

  getIssueById = asyncHandler(async (req, res) => {
    const issue = await issueService.getIssueById(req.params.id, req.user.id);
    res.json({ success: true, data: issue });
  });

  createIssue = asyncHandler(async (req, res) => {
    const workspaceId = workspaceBody(req) || workspaceHeader(req) || null;
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const issue = await issueService.createIssue(
      req.user.id,
      {
        ...req.body,
        workspaceId,
      },
      appContext,
    );
    res.status(201).json({ success: true, data: issue });
  });

  updateIssue = asyncHandler(async (req, res) => {
    const issue = await issueService.updateIssue(
      req.params.id,
      req.user.id,
      req.body,
    );
    res.json({ success: true, data: issue });
  });

  deleteIssue = asyncHandler(async (req, res) => {
    await issueService.deleteIssue(req.params.id, req.user.id);
    res.json({
      success: true,
      data: { message: "Issue deleted successfully" },
    });
  });
}

module.exports = new IssueController();
