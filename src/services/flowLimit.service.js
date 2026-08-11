"use strict";

const { prisma } = require("../lib/prisma");
const AppError = require("../utils/AppError");
const { appScope, resolveWorkspaceId } = require("../lib/workspaceScope");
const notificationService = require("./notification.service");
const {
  setDowngradeFlagByIds,
  clearDowngradeFlagInScope,
} = require("../lib/flowDowngradeFlag");

// Was `new PrismaClient()` — a second connection pool alongside lib/prisma's,
// and the reason this service had no tests at all (the suite mocks
// ../src/lib/prisma, which this file bypassed, so any test here would have hit
// a real database). Same client, shared pool, now mockable.

// AppType enum: 'individual' = pro app context, 'enterprise' = team app context
const toDbAppType = (appContext) =>
  appContext === "pro" ? "individual" : "enterprise";

class FlowLimitService {
  /**
   * Called by the monthly-cycle cron when flowUsed > totCount for a user+appType.
   * Sets overLimitLocked=true and resets overLimitModalShown=false so the
   * one-time modal fires again on the next login/flows-page visit.
   */
  async setOverLimitLocked(userId, appType) {
    // Reset markedForDowngrade on all flows so the picker shows the full set —
    // and "the full set" is now appScope, matching the picker and the lock
    // below. With the old exact equality a free-era flow kept a stale
    // markedForDowngrade from a previous cycle and showed as at-risk forever.
    // Raw, so clearing the flag does not stamp `updated_at` (bug-119).
    await clearDowngradeFlagInScope(prisma, userId, appType);
    await prisma.flowLimit.updateMany({
      where: { userId, appType: toDbAppType(appType) },
      data: {
        overLimitLocked: true,
        overLimitModalShown: false,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Marks the one-time modal as shown for this cycle so it does not repeat.
   * Called by the frontend after the modal is first displayed.
   */
  async markModalShown(userId, appType) {
    await prisma.flowLimit.updateMany({
      where: { userId, appType: toDbAppType(appType) },
      data: { overLimitModalShown: true, updatedAt: new Date() },
    });
  }

  /**
   * Returns the current lock + modal state for a user+appType.
   * Used by the flows page to decide whether to show the lock badge / modal.
   */
  async getLockState(userId, appType, requestedWorkspaceId = null) {
    // bug-125: the lock belongs to the WORKSPACE OWNER, not the caller. Keyed on
    // `userId`, a MEMBER in an over-limit workspace had no flow_limits row of
    // their own → reported unlocked → the flows list showed the owner's flows
    // with no lock overlay and no modal, even while the editor (bug-121) refused
    // to open them. Resolve to the owner first (membership verified server-side,
    // so a stale/forged header can only fall back to the caller's own).
    const workspaceId = await resolveWorkspaceId(userId, requestedWorkspaceId);
    const record = await prisma.flowLimit.findFirst({
      where: { userId: workspaceId, appType: toDbAppType(appType) },
      select: {
        overLimitLocked: true,
        overLimitModalShown: true,
        totCount: true,
        flowUsed: true,
      },
    });
    return (
      record || {
        overLimitLocked: false,
        overLimitModalShown: false,
        totCount: null,
        flowUsed: null,
      }
    );
  }

  /**
   * Resolves the over-limit lock by locking (keeping) only the selectedFlowIds.
   * All other flows for this user+appType remain accessible but are NOT unlocked
   * here — the caller's selected flows are the only ones that will be active.
   *
   * Steps:
   *  1. Verify selectedFlowIds.length <= limit (totCount).
   *  2. Soft-delete (markedForDowngrade) all flows NOT in selectedFlowIds.
   *  3. Clear overLimitLocked and overLimitModalShown on the FlowLimit record.
   *  4. Update flowUsed to reflect the new count.
   *
   * @param {string} userId
   * @param {string} appType  'pro' | 'team'
   * @param {string[]} selectedFlowIds  IDs the user chose to keep
   */
  async resolveOverLimit(userId, appType, selectedFlowIds) {
    const limitRecord = await prisma.flowLimit.findFirst({
      where: { userId, appType: toDbAppType(appType) },
      select: { totCount: true, overLimitLocked: true },
    });

    if (!limitRecord) {
      throw new AppError("Flow limit record not found", 404, "NOT_FOUND");
    }

    if (!limitRecord.overLimitLocked) {
      // Nothing to resolve — return silently
      return { resolved: false, reason: "not_locked" };
    }

    const limit = limitRecord.totCount;
    if (limit !== null && selectedFlowIds.length > limit) {
      throw new AppError(
        `You can only keep ${limit} flows. You selected ${selectedFlowIds.length}.`,
        400,
        "VALIDATION_ERROR",
      );
    }

    // Determine all personal flows for this user+appType context that are NOT selected.
    // Pro flows live inside the owner's Pro team; Team flows live in a team-context team.
    // We scope by workspaceId + appContext to isolate each app's flows independently.
    // `appScope`, not `appContext: appType`. The exact equality dropped
    // free-era flows, which `getPackStatus` DOES count (free-fold) — so a user
    // told "you have 12, keep 10" was shown 9 in the picker and the 3 invisible
    // ones were never locked either. The list and the lock must both read the
    // same set the counter used.
    const flowsToLock = await prisma.flow.findMany({
      where: {
        workspaceId: userId,
        ...appScope(appType),
        deletedAt: null,
        id: { notIn: selectedFlowIds },
      },
      // creatorId + name so members can be told which of THEIR flows was locked
      // (bug-120) — the owner is choosing on their behalf.
      select: { id: true, name: true, creatorId: true },
    });

    const idsToLock = flowsToLock.map((f) => f.id);

    await prisma.$transaction([
      // Soft-lock unselected flows
      // Raw, so locking does not read as "Edited just now" and float these
      // flows to the top of every recency-ordered list (bug-119).
      ...(idsToLock.length > 0
        ? [setDowngradeFlagByIds(prisma, idsToLock, true)]
        : []),
      // Clear the lock
      prisma.flowLimit.updateMany({
        where: { userId, appType: toDbAppType(appType) },
        data: {
          overLimitLocked: false,
          overLimitModalShown: false,
          flowUsed: selectedFlowIds.length,
          updatedAt: new Date(),
        },
      }),
    ]);

    // bug-120: tell each MEMBER whose flow the owner just locked. Without this
    // a member's work silently turns read-only with no explanation and no route
    // to recover it — they have no picker of their own (their `flow_limits` row
    // does not exist, so /dashboard/limitflows is empty for them).
    //
    // Fire-and-forget and individually guarded: notifying is never allowed to
    // fail the unlock the user just performed.
    await this._notifyMembersOfLockedFlows(userId, appType, flowsToLock);

    return {
      resolved: true,
      keptCount: selectedFlowIds.length,
      lockedCount: idsToLock.length,
    };
  }

  /** One notification per affected member, listing their own locked flows. */
  async _notifyMembersOfLockedFlows(actorId, appType, lockedFlows) {
    try {
      const byMember = new Map();
      for (const f of lockedFlows) {
        // Skip the actor's own flows and legacy unattributed rows.
        if (!f.creatorId || f.creatorId === actorId) continue;
        if (!byMember.has(f.creatorId)) byMember.set(f.creatorId, []);
        byMember.get(f.creatorId).push(f.name);
      }
      if (byMember.size === 0) return;

      const actor = await prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true, email: true },
      });
      const who = actor?.name || actor?.email || "The workspace owner";
      const appContext = appType === "pro" ? "pro" : "team";

      await Promise.all(
        [...byMember.entries()].map(([memberId, names]) => {
          const listed = names.slice(0, 3).join(", ");
          const extra = names.length > 3 ? ` and ${names.length - 3} more` : "";
          return notificationService
            .createNotification(
              memberId,
              "flow_locked_by_owner",
              names.length === 1
                ? "A flow was locked"
                : "Some flows were locked",
              `${who} reached their plan's flow limit and locked ${listed}${extra}. ` +
                `Ask them to upgrade or choose your flow to keep it available.`,
              "/dashboard/flows",
              { flowNames: names, lockedBy: actorId },
              appContext,
              actorId, // the workspace these flows live in
            )
            .catch(() => null);
        }),
      );
    } catch {
      // Never let notification failure roll back a completed unlock.
    }
  }

  /**
   * Returns flows for the /dashboard/limitflows picker, pre-sorted by most
   * recently updated (the default selection for the user).
   * Scoped strictly by workspaceId + appContext so Pro and Team are isolated.
   */
  async getFlowsForPicker(userId, appType) {
    // bug-120: the picker scopes by WORKSPACE, so a workspace owner is choosing
    // for their members too — a member's flow lives under the owner's
    // workspaceId and is therefore offered here. It used to be listed with no
    // attribution at all, so an owner could lock a teammate's work without ever
    // knowing whose it was. Owner decision 2026-08-09: keep listing them, but
    // say who made them (and notify the member — see resolveOverLimit).
    const flows = await prisma.flow.findMany({
      where: {
        workspaceId: userId,
        ...appScope(appType),
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        thumbnail: true,
        updatedAt: true,
        createdAt: true,
        creatorId: true,
        // `image` is the OAuth field and is null for password accounts; `photo`
        // is the in-app upload. Every other surface resolves `image || photo`,
        // so this one does too (bug-103's avatar lesson).
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            photo: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return flows.map((f) => {
      const { creator, ...rest } = f;
      // A null creatorId is a legacy row predating attribution — treat it as
      // the owner's, exactly as resolveWorkspaceScope does.
      const self = !f.creatorId || f.creatorId === userId;
      return {
        ...rest,
        createdBySelf: self,
        createdByName: self
          ? null
          : creator?.name || creator?.email || "Member",
        createdByEmail: self ? null : creator?.email || null,
        createdByImage: self ? null : creator?.image || creator?.photo || null,
      };
    });
  }
}

module.exports = new FlowLimitService();
