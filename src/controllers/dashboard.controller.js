const dashboardService = require("../services/dashboard.service");
const asyncHandler = require("../utils/asyncHandler");
const { workspaceHeader, workspaceQuery } = require("../lib/workspaceContext");

class DashboardController {
  // Resolve the active workspace context from a request. Headers are the
  // primary channel, but the axios interceptor ALSO mirrors them as query
  // params (_appctx / _tc) for URL cache-keying — so we fall back to those,
  // making context resolution survive a proxy layer that strips custom
  // headers. Final fallback is the user's stored plan.
  _appContext(req) {
    return (
      req.headers["x-app-context"] ||
      req.query._appctx ||
      req.user.currentVersion ||
      "team"
    );
  }

  _teamId(req) {
    return (
      workspaceQuery(req) || workspaceHeader(req) || req.query._tc || null
    );
  }

  getStats = asyncHandler(async (req, res) => {
    const stats = await dashboardService.getStats(
      req.user.id,
      this._appContext(req),
      this._teamId(req),
    );
    res.json({ success: true, data: stats });
  });

  getActivity = asyncHandler(async (req, res) => {
    const activity = await dashboardService.getActivity(
      req.user.id,
      this._appContext(req),
      this._teamId(req),
    );
    res.json({ success: true, data: activity });
  });

  getRecentFlows = asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 5, 20);
    const flows = await dashboardService.getRecentFlows(
      req.user.id,
      this._appContext(req),
      limit,
      this._teamId(req),
    );
    res.json({ success: true, data: flows });
  });

  getTeamActivity = asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const activity = await dashboardService.getTeamActivity(
      req.user.id,
      limit,
      this._teamId(req),
      this._appContext(req),
    );
    res.json({ success: true, data: activity });
  });
}

module.exports = new DashboardController();
