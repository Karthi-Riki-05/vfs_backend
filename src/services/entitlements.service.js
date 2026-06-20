/**
 * Centralized entitlement / feature-gating resolver for ValueCharts.
 *
 * Rule #1 (per-user gate): premium access is decided by what a user OWNS —
 * their single subscription / pro purchase — NOT by the workspace context
 * they are currently viewing (currentVersion / X-App-Context). Tier
 * resolution is delegated to utils/userTier so there is exactly ONE source
 * of truth (see that file's ownership-vs-context warning). NEVER re-derive
 * tier from the request context here.
 *
 * Container model (matches the workspace-scope refactor): `free` folds into
 * the Team-App shell; `pro` is the standalone premium container; `team` is
 * the paid multi-seat container.
 *
 * Consumed by:
 *   • route middleware → src/middleware/requireEntitlement.js
 *   • frontend layout  → GET /api/v1/entitlements
 *
 * SCAFFOLD NOTE: the matrix below is the single place to tune premium gating.
 * Booleans/modules reflect current behavior (e.g. aiProvider mirrors
 * utils/userTier.usesClaude). Numeric `limits` are intentionally left null —
 * wire them to the real Plan / flow-pack source rather than hardcoding here,
 * so entitlements never diverge from billing (DATA-LOSS-001 mindset).
 */
const { getTierByUserId } = require("../utils/userTier");

const ENTITLEMENTS = {
  free: {
    aiProvider: "gemini",
    canUseClaude: false,
    canManageTeams: false,
    canShareFlows: false,
    modules: ["flows", "shapes", "projects"],
    // TODO(product): source real free-tier ceilings from Plan / flow-pack.
    limits: { maxFlows: null, maxTeamMembers: 0, aiCreditsPerMonth: null },
  },
  pro: {
    aiProvider: "claude",
    canUseClaude: true,
    canManageTeams: false,
    canShareFlows: true,
    modules: ["flows", "shapes", "projects", "ai-assistant"],
    limits: { maxFlows: null, maxTeamMembers: 0, aiCreditsPerMonth: null },
  },
  team: {
    aiProvider: "claude",
    canUseClaude: true,
    canManageTeams: true,
    canShareFlows: true,
    modules: ["flows", "shapes", "projects", "ai-assistant", "teams", "chat"],
    limits: { maxFlows: null, maxTeamMembers: null, aiCreditsPerMonth: null },
  },
};

/**
 * Resolve the full entitlement payload for a user.
 * Never throws — getTierByUserId already falls back to 'free' on DB failure.
 * @param {string} userId
 * @returns {Promise<{tier: 'free'|'pro'|'team', isPaid: boolean, ...}>}
 */
async function getEntitlements(userId) {
  const tier = await getTierByUserId(userId); // 'free' | 'pro' | 'team'
  const base = ENTITLEMENTS[tier] || ENTITLEMENTS.free;
  return {
    tier,
    isPaid: tier !== "free",
    aiProvider: base.aiProvider,
    canUseClaude: base.canUseClaude,
    canManageTeams: base.canManageTeams,
    canShareFlows: base.canShareFlows,
    // Clone so callers cannot mutate the shared matrix.
    modules: [...base.modules],
    limits: { ...base.limits },
  };
}

/** Module-access predicate against a resolved entitlement payload. */
function hasModule(entitlements, moduleKey) {
  return (
    Array.isArray(entitlements?.modules) &&
    entitlements.modules.includes(moduleKey)
  );
}

module.exports = { getEntitlements, hasModule, ENTITLEMENTS };
