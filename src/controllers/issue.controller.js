const issueService = require("../services/issue.service");
const asyncHandler = require("../utils/asyncHandler");

class IssueController {
  getIssues = asyncHandler(async (req, res) => {
    const teamId = req.query.teamId || req.headers["x-team-context"] || null;
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const result = await issueService.getIssues(
      req.user.id,
      {
        ...req.query,
        teamId,
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
    const teamId = req.body?.teamId || req.headers["x-team-context"] || null;
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const issue = await issueService.createIssue(
      req.user.id,
      {
        ...req.body,
        teamId,
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
