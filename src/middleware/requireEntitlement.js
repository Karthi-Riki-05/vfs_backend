/**
 * Route-level feature-gating middleware, backed by the centralized
 * entitlements service (per-user ownership gate — see entitlements.service.js).
 *
 * Use AFTER `authenticate` so req.user.id is available. All gates attach the
 * resolved payload to req.entitlements (idempotent) so downstream handlers and
 * stacked gates reuse a single lookup. Denials throw the same
 * 403 UPGRADE_REQUIRED shape used elsewhere (enforceProContext).
 *
 *   router.post("/teams", authenticate, requireTier("team"), ctrl.create)
 *   router.use("/ai", authenticate, requireModule("ai-assistant"))
 */
const {
  getEntitlements,
  hasModule,
} = require("../services/entitlements.service");
const AppError = require("../utils/AppError");

// Ordered so a higher rank satisfies a lower minimum (both paid tiers use
// Claude). Pro and Team are distinct containers, not a strict hierarchy — this
// rank only answers "is this at least as privileged as X".
const TIER_RANK = { free: 0, pro: 1, team: 2 };

async function _ensure(req) {
  if (!req.entitlements && req.user?.id) {
    req.entitlements = await getEntitlements(req.user.id);
  }
  return req.entitlements;
}

/** Attach req.entitlements without gating (for handlers that branch on it). */
async function loadEntitlements(req, res, next) {
  try {
    await _ensure(req);
    next();
  } catch (err) {
    next(err);
  }
}

/** Require at least `minTier` ('pro' allows pro+team; 'team' allows team). */
function requireTier(minTier) {
  return async (req, res, next) => {
    try {
      const ent = await _ensure(req);
      if ((TIER_RANK[ent?.tier] ?? 0) < (TIER_RANK[minTier] ?? 99)) {
        throw new AppError(
          "Upgrade required for this feature",
          403,
          "UPGRADE_REQUIRED",
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Require access to a named module (see ENTITLEMENTS.modules). */
function requireModule(moduleKey) {
  return async (req, res, next) => {
    try {
      const ent = await _ensure(req);
      if (!hasModule(ent, moduleKey)) {
        throw new AppError(
          "Upgrade required for this feature",
          403,
          "UPGRADE_REQUIRED",
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { loadEntitlements, requireTier, requireModule };
