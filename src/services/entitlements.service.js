/**
 * Centralized entitlement / feature-gating resolver for ValueCharts.
 *
 * Rule #1 (per-user gate): premium access is decided by what a user OWNS.
 * Multi-tenant exception (§5 architecture): when a member is operating inside
 * a joined tenant (workspaceId provided), entitlements derive from the TENANT
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
const { resolveWorkspaceId } = require("../lib/workspaceScope");

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
 * @param {string|null} [workspaceId] - Active team context (X-Workspace-Context header).
 *   When provided and the user is a member (not owner) of a team whose owner
 *   holds a paid plan, entitlements derive from the TEAM OWNER's tier so the
 *   member inherits premium features (§5.2 Inherited Subscription Power).
 * @returns {Promise<{tier: 'free'|'pro'|'team', isPaid: boolean, ...}>}
 */
async function getEntitlements(userId, workspaceId = null, appContext = null) {
  // Multi-tenant inheritance: inside someone else's workspace the caller gets
  // THAT OWNER's tier, so a seat actually buys the buyer's plan.
  //
  // This used to look the id up in `teams` (`where: { id: workspaceId }`). Since
  // owner-as-workspace (2026-08-07) the id is a USER id, so the lookup never
  // matched and inheritance silently never happened — a member of a Team
  // workspace kept their own tier, losing `teams`/`chat` and dropping from a
  // 100- to a 50-version history. `resolveWorkspaceId` verifies the claim
  // server-side, so a forged header still grants nothing (DATA-LOSS-001).
  const resolvedUserId = workspaceId
    ? await resolveWorkspaceId(userId, workspaceId)
    : userId;

  const tier = await getTierByUserId(resolvedUserId); // 'free' | 'pro' | 'team'
  const base = ENTITLEMENTS[tier] || ENTITLEMENTS.free;

  // Modules are per-APP, not per-tier alone. A Pro purchase buys the PRO app
  // outright — Chat and Teams included — but buys nothing in the Team app.
  //
  // The static table cannot express that, so `pro` listed neither, and this
  // payload contradicted the middleware that actually gates those routes
  // (`requireTeamChatEntitlement`, which has always allowed a real Pro
  // purchase). The API said "no" while the server said "yes"; anything that
  // started trusting `modules` would have broken Pro users with no change to
  // the gate itself. Align the description with the enforcement.
  const modules = [...base.modules];
  if (tier === "pro" && appContext === "pro") {
    for (const m of ["teams", "chat"]) {
      if (!modules.includes(m)) modules.push(m);
    }
  }

  return {
    tier,
    isPaid: tier !== "free",
    aiProvider: base.aiProvider,
    canUseClaude: base.canUseClaude,
    canManageTeams: base.canManageTeams,
    canShareFlows: base.canShareFlows,
    canExport: base.canExport,
    // Clone so callers cannot mutate the shared matrix.
    modules,
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
