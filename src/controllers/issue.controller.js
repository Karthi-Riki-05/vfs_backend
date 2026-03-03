const issueService = require('../services/issue.service');
const asyncHandler = require('../utils/asyncHandler');

class IssueController {
    getIssues = asyncHandler(async (req, res) => {
        const result = await issueService.getIssues(req.user.id, req.query);
        res.json({ success: true, data: result });
    });

    getIssueById = asyncHandler(async (req, res) => {
        const issue = await issueService.getIssueById(req.params.id, req.user.id);
        res.json({ success: true, data: issue });
    });

    createIssue = asyncHandler(async (req, res) => {
        const issue = await issueService.createIssue(req.user.id, req.body);
        res.status(201).json({ success: true, data: issue });
    });

    updateIssue = asyncHandler(async (req, res) => {
        const issue = await issueService.updateIssue(req.params.id, req.user.id, req.body);
        res.json({ success: true, data: issue });
    });

    deleteIssue = asyncHandler(async (req, res) => {
        await issueService.deleteIssue(req.params.id, req.user.id);
        res.json({ success: true, data: { message: 'Issue deleted successfully' } });
    });
}

module.exports = new IssueController();
