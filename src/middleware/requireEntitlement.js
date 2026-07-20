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
const { prisma } = require("../lib/prisma");
const AppError = require("../utils/AppError");

// Ordered so a higher rank satisfies a lower minimum (both paid tiers use
// Claude). Pro and Team are distinct containers, not a strict hierarchy — this
// rank only answers "is this at least as privileged as X".
const TIER_RANK = { free: 0, pro: 1, team: 2 };

async function _ensure(req) {
  if (!req.entitlements && req.user?.id) {
    // Pass X-Team-Context so members inside a paid tenant inherit the tenant
    // owner's entitlements (§5.2 Inherited Subscription Power).
    const teamId = req.headers["x-team-context"] || null;
    req.entitlements = await getEntitlements(req.user.id, teamId);
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

/**
 * Require a boolean feature flag on the resolved entitlements payload
 * (e.g. requireFeature("canShareFlows")). Same X-Team-Context inheritance
 * as every other gate: a free member inside a paid tenant inherits the
 * tenant owner's flags.
 */
function requireFeature(flagKey) {
  return async (req, res, next) => {
    try {
      const ent = await _ensure(req);
      if (ent?.[flagKey] !== true) {
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

/**
 * Gate team creation by the app context the request is operating in.
 * Pro App (X-App-Context: pro) requires at least Pro tier; Team App (and the
 * default) requires Team tier. Delegates to requireTier so the actual gate
 * remains ownership-based (header only selects WHICH tier minimum applies).
 *
 * §5 GAP-04 extension: if the caller holds the ADMIN role inside the active
 * tenant (X-Team-Context), allow team creation regardless of their own tier —
 * the sub-team is created under the tenant owner's ownerId hierarchy.
 */
async function requireTeamCreateEntitlement(req, res, next) {
  try {
    const teamId = req.headers["x-team-context"] || null;
    if (teamId && req.user?.id) {
      const membership = await prisma.teamMember.findFirst({
        where: {
          teamId,
          userId: req.user.id,
          role: "ADMIN",
          team: { deletedAt: null },
        },
        select: { id: true },
      });
      if (membership) return next();
    }
    const appContext =
      req.headers["x-app-context"] || req.user?.currentVersion || "team";
    const minTier = appContext === "pro" ? "pro" : "team";
    return requireTier(minTier)(req, res, next);
  } catch (err) {
    next(err);
  }
}

/**
 * Gate chat (a team feature). Allows callers who have team-chat access:
 *   • Pro App owners (hasPro)                  → allow
 *   • Active team workspace (currentVersion)   → allow
 *   • Member of any (non-deleted) team         → allow (can chat in that team)
 *   • else                                     → 403 UPGRADE_REQUIRED
 *
 * Reads req.user (populated by `authenticate` with hasPro/currentVersion) and,
 * only as a last resort, one teamMember lookup. Intentionally does NOT call the
 * entitlements service so it adds no extra user.findUnique call.
 */
async function requireTeamChatEntitlement(req, res, next) {
  try {
    const user = req.user;
    if (!user?.id) {
      throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    }

    // Pro App owners and the active team workspace always have chat.
    if (user.hasPro === true || user.currentVersion === "team") return next();

    // A free user invited to a team can still chat within that team.
    const membership = await prisma.teamMember.findFirst({
      where: { userId: user.id, team: { deletedAt: null } },
      select: { id: true },
    });
    if (membership) return next();

    throw new AppError(
      "Upgrade required for team chat",
      403,
      "UPGRADE_REQUIRED",
    );
  } catch (err) {
    next(err);
  }
}

module.exports = {
  loadEntitlements,
  requireTier,
  requireFeature,
  requireModule,
  requireTeamCreateEntitlement,
  requireTeamChatEntitlement,
};
