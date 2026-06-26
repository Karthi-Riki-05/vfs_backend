const { getEntitlements } = require("../services/entitlements.service");
const asyncHandler = require("../utils/asyncHandler");

class EntitlementsController {
  // GET /api/v1/entitlements — the frontend layout calls this once on load to
  // decide which premium modules/features to render.
  // §5: passes X-Team-Context so members inside a paid tenant inherit the
  // tenant owner's tier (Inherited Subscription Power, GAP-05).
  getMine = asyncHandler(async (req, res) => {
    const teamId = req.headers["x-team-context"] || null;
    const entitlements = await getEntitlements(req.user.id, teamId);
    res.json({ success: true, data: entitlements });
  });
}

module.exports = new EntitlementsController();
