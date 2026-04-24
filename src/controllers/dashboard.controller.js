const dashboardService = require("../services/dashboard.service");
const asyncHandler = require("../utils/asyncHandler");

class DashboardController {
  getStats = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appContext = req.user.currentVersion || "free";
    const { teamId } = req.query;
    const stats = await dashboardService.getStats(userId, appContext, teamId);
    res.json({ success: true, data: stats });
  });

  getActivity = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appContext = req.user.currentVersion || "free";
    const { teamId } = req.query;
    const activity = await dashboardService.getActivity(
      userId,
      appContext,
      teamId,
    );
    res.json({ success: true, data: activity });
  });

  getRecentFlows = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appContext = req.user.currentVersion || "free";
    const limit = Math.min(Number(req.query.limit) || 5, 20);
    const { teamId } = req.query;
    const flows = await dashboardService.getRecentFlows(
      userId,
      appContext,
      limit,
      teamId,
    );
    res.json({ success: true, data: flows });
  });

  getTeamActivity = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const activity = await dashboardService.getTeamActivity(userId, limit);
    res.json({ success: true, data: activity });
  });
}

module.exports = new DashboardController();
