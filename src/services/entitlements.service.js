/**
 * Centralized entitlement / feature-gating resolver for ValueCharts.
 *
 * Rule #1 (per-user gate): premium access is decided by what a user OWNS.
 * Multi-tenant exception (§5 architecture): when a member is operating inside
 * a joined tenant (teamId provided), entitlements derive from the TENANT
 * OWNER's subscription so members inherit unlimited flows and premium features
 * while working under that directory context (docs/multi-tenant-brd.md §5.2).
 *
 * Container model: `free` folds into Team-App shell; `pro` is standalone
 * premium; `team` is the paid multi-seat container.
 *
 * Consumed by:
 *   • route middleware → src/middleware/requireEntitlement.js
 *   • frontend layout  → GET /api/v1/entitlements
 */
const { getTierByUserId } = require("../utils/userTier");
const { prisma } = require("../lib/prisma");

const ENTITLEMENTS = {
  free: {
    aiProvider: "gemini",
    canUseClaude: false,
    canManageTeams: false,
    canShareFlows: false,
    canExport: false,
    modules: ["flows", "shapes", "projects"],
    // TODO(product): source real free-tier ceilings from Plan / flow-pack.
    limits: {
      maxFlows: null,
      maxTeamMembers: 0,
      aiCreditsPerMonth: null,
      versionLimit: 10,
      messagesLimit: 50,
    },
  },
  pro: {
    aiProvider: "claude",
    canUseClaude: true,
    canManageTeams: true,
    canShareFlows: true,
    canExport: true,
    modules: ["flows", "shapes", "projects", "ai-assistant"],
    limits: {
      maxFlows: null,
      maxTeamMembers: 0,
      aiCreditsPerMonth: null,
      versionLimit: 50,
      messagesLimit: 500,
    },
  },
  team: {
    aiProvider: "claude",
    canUseClaude: true,
    canManageTeams: true,
    canShareFlows: true,
    canExport: true,
    modules: ["flows", "shapes", "projects", "ai-assistant", "teams", "chat"],
    limits: {
      maxFlows: null,
      maxTeamMembers: null,
      aiCreditsPerMonth: null,
      versionLimit: 100,
      messagesLimit: 500,
    },
  },
};

/**
 * Resolve the full entitlement payload for a user.
 * Never throws — getTierByUserId already falls back to 'free' on DB failure.
 *
 * @param {string} userId  - The calling user's id.
 * @param {string|null} [teamId] - Active team context (X-Team-Context header).
 *   When provided and the user is a member (not owner) of a team whose owner
 *   holds a paid plan, entitlements derive from the TEAM OWNER's tier so the
 *   member inherits premium features (§5.2 Inherited Subscription Power).
 * @returns {Promise<{tier: 'free'|'pro'|'team', isPaid: boolean, ...}>}
 */
async function getEntitlements(userId, teamId = null) {
  let resolvedUserId = userId;

  // Multi-tenant inheritance: if the caller is inside a joined team, use the
  // team owner's tier. Skip if the caller IS the team owner (no change).
  if (teamId) {
    try {
      const team = await prisma.team.findFirst({
        where: { id: teamId, deletedAt: null },
        select: { teamOwnerId: true },
      });
      if (team && team.teamOwnerId !== userId) {
        resolvedUserId = team.teamOwnerId;
      }
    } catch {
      // Fall back to caller's own tier on any DB error.
    }
  }

  const tier = await getTierByUserId(resolvedUserId); // 'free' | 'pro' | 'team'
  const base = ENTITLEMENTS[tier] || ENTITLEMENTS.free;
  return {
    tier,
    isPaid: tier !== "free",
    aiProvider: base.aiProvider,
    canUseClaude: base.canUseClaude,
    canManageTeams: base.canManageTeams,
    canShareFlows: base.canShareFlows,
    canExport: base.canExport,
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
