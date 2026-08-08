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
const { hasProPurchase, paidOwnerWhere } = require("../utils/planResolver");
const { workspaceHeader } = require("../lib/workspaceContext");

// Ordered so a higher rank satisfies a lower minimum (both paid tiers use
// Claude). Pro and Team are distinct containers, not a strict hierarchy — this
// rank only answers "is this at least as privileged as X".
const TIER_RANK = { free: 0, pro: 1, team: 2 };

async function _ensure(req) {
  if (!req.entitlements && req.user?.id) {
    // Pass X-Workspace-Context so members inside a paid tenant inherit the tenant
    // owner's entitlements (§5.2 Inherited Subscription Power).
    const workspaceId = workspaceHeader(req) || null;
    const appContext = req.headers["x-app-context"] || null;
    req.entitlements = await getEntitlements(
      req.user.id,
      workspaceId,
      appContext,
    );
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
 * (e.g. requireFeature("canShareFlows")). Same X-Workspace-Context inheritance
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
 * bug-085 (Option A): a caller acting INSIDE another owner's tenant
 * (X-Workspace-Context points to a team they do NOT own — the only kind the profile
 * switcher ever selects, since an owned team folds into the personal context)
 * may only be invited into / invite within that tenant team. They must NOT
 * mint a new, caller-owned top-level team: it would escape the tenant owner's
 * hierarchy and, via the caller's own (often free) tier, create a downgraded
 * workspace. We block that here BEFORE requireTier, because requireTier
 * resolves entitlements WITH tenant inheritance and would otherwise let any
 * member of a paid tenant pass on the owner's inherited team tier — regardless
 * of role. (This replaces the former §5 GAP-04 ADMIN allow-branch, which let
 * ADMINs — and, via inheritance, ordinary members — create caller-owned teams.)
 * Team owners and the personal/no-context case fall through to the own-tier
 * gate below (getEntitlements resolves to the caller: no workspaceId, or caller==owner).
 */
async function requireTeamCreateEntitlement(req, res, next) {
  try {
    const workspaceId = workspaceHeader(req) || null;
    if (workspaceId && req.user?.id) {
      // The workspace id IS the owner's user id (owner-as-workspace,
      // 2026-08-07), so ownership is a comparison — no lookup.
      //
      // This used to resolve the owner with `team.findFirst({ id: workspaceId })`,
      // which stopped matching after the rename: `tenant` was always null, the
      // block never fired, and bug-085's rule silently lapsed — any member could
      // mint a team inside someone else's workspace again. Comparing ids cannot
      // fail open the way a lookup can.
      if (workspaceId !== req.user.id) {
        // bug-112 (owner decision, 2026-08-09): ADMINs may create teams inside
        // the workspace they administer. Plain MEMBERs still cannot — that half
        // of bug-085 stands.
        //
        // The escape bug-085 actually closed was a CALLER-OWNED team escaping
        // the tenant and inheriting the caller's (often free) tier. That is
        // fixed in createTeam instead: the team is owned by the WORKSPACE
        // OWNER, so an admin creating one cannot downgrade or detach it.
        // ⚠️ Seats are PER-APP (`team_members.app_context`, 2026-08-08), so this
        // must match the app the request is in. Without the filter, an ADMIN in
        // the Team app was allowed to create teams in the PRO app of the same
        // workspace, where they are only a MEMBER — caught live, exactly the
        // bug-085 hole reopening through the back door.
        const reqApp =
          (req.headers["x-app-context"] || req.user?.currentVersion) === "pro"
            ? "pro"
            : "team";
        const adminSeat = await prisma.teamMember.findFirst({
          where: {
            userId: req.user.id,
            workspaceId,
            role: "ADMIN",
            appContext: reqApp,
          },
          select: { id: true },
        });
        if (!adminSeat) {
          throw new AppError(
            "Members cannot create new teams inside a workspace they do not own. Switch to your personal workspace to create a team.",
            403,
            "TEAM_CREATE_FORBIDDEN",
          );
        }
      }
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
 *   • Genuine Pro lifetime purchase            → allow
 *   • Member/owner of a team whose OWNER holds
 *     a live paid plan                         → allow (chat inside that team)
 *   • else                                     → 403 UPGRADE_REQUIRED
 *
 * bug-086: this used to allow on `user.hasPro` alone (a flag team grants can
 * flip), on `user.currentVersion === "team"` (the ACTIVE WORKSPACE column, not
 * a receipt — see utils/userTier.js), and on the mere EXISTENCE of a membership
 * row. That last one is why a free user who owned two unpaid teams got 200 from
 * every chat route: nothing removes teams or memberships when a subscription
 * lapses, so "has a membership" outlived "someone is paying". The paid intent
 * is preserved — a free user invited into a PAYING team still chats, because
 * the plan is resolved from the team owner, not the caller.
 */
async function requireTeamChatEntitlement(req, res, next) {
  try {
    const user = req.user;
    if (!user?.id) {
      throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    }

    // Pro lifetime buyers get chat. `hasPro` needs proPurchasedAt as proof —
    // both fields are already on req.user, so this costs no query.
    if (hasProPurchase(user)) return next();

    // Chat lives inside a team, so the question is whether ANY team the caller
    // belongs to (owned or joined) is currently paid for by its OWNER. The
    // paid-owner test runs inside the query (paidOwnerWhere) so this stays a
    // single indexed lookup, exactly as cheap as the old membership-only check.
    // CHANGE-001: membership no longer joins through a team — the row names its
    // workspace directly, and the workspace IS its owner. So "is any workspace
    // I belong to paid for by its owner" is a single hop through `workspace`.
    const paidMembership = await prisma.teamMember.findFirst({
      where: {
        userId: user.id,
        workspace: paidOwnerWhere(),
      },
      select: { id: true },
    });
    if (paidMembership) return next();

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
