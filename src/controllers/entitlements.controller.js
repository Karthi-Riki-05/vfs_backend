const { getEntitlements } = require("../services/entitlements.service");
const asyncHandler = require("../utils/asyncHandler");
const { workspaceHeader } = require("../lib/workspaceContext");

class EntitlementsController {
  // GET /api/v1/entitlements — the frontend layout calls this once on load to
  // decide which premium modules/features to render.
  // §5: passes X-Workspace-Context so members inside a paid tenant inherit the
  // tenant owner's tier (Inherited Subscription Power, GAP-05).
  getMine = asyncHandler(async (req, res) => {
    const workspaceId = workspaceHeader(req) || null;
    // The app matters: a Pro purchase unlocks Chat/Teams in the PRO app only.
    const appContext = req.headers["x-app-context"] || null;
    const entitlements = await getEntitlements(
      req.user.id,
      workspaceId,
      appContext,
    );
    res.json({ success: true, data: entitlements });
  });
}

module.exports = new EntitlementsController();
