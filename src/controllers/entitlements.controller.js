const { getEntitlements } = require("../services/entitlements.service");
const asyncHandler = require("../utils/asyncHandler");

class EntitlementsController {
  // GET /api/v1/entitlements — the frontend layout calls this once on load to
  // decide which premium modules/features to render. Per-user gate (rule #1):
  // result is independent of the active workspace context.
  getMine = asyncHandler(async (req, res) => {
    const entitlements = await getEntitlements(req.user.id);
    res.json({ success: true, data: entitlements });
  });
}

module.exports = new EntitlementsController();
