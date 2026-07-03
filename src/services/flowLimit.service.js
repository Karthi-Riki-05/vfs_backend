"use strict";

const { PrismaClient } = require("@prisma/client");
const AppError = require("../utils/AppError");

const prisma = new PrismaClient();

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
    // Reset markedForDowngrade on all flows so the picker shows the full set
    await prisma.flow.updateMany({
      where: { ownerId: userId, appContext: appType, deletedAt: null },
      data: { markedForDowngrade: false },
    });
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
  async getLockState(userId, appType) {
    const record = await prisma.flowLimit.findFirst({
      where: { userId, appType: toDbAppType(appType) },
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
    // We scope by ownerId + appContext to isolate each app's flows independently.
    const flowsToLock = await prisma.flow.findMany({
      where: {
        ownerId: userId,
        appContext: appType,
        deletedAt: null,
        id: { notIn: selectedFlowIds },
      },
      select: { id: true },
    });

    const idsToLock = flowsToLock.map((f) => f.id);

    await prisma.$transaction([
      // Soft-lock unselected flows
      ...(idsToLock.length > 0
        ? [
            prisma.flow.updateMany({
              where: { id: { in: idsToLock } },
              data: { markedForDowngrade: true },
            }),
          ]
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

    return {
      resolved: true,
      keptCount: selectedFlowIds.length,
      lockedCount: idsToLock.length,
    };
  }

  /**
   * Returns flows for the /dashboard/limitflows picker, pre-sorted by most
   * recently updated (the default selection for the user).
   * Scoped strictly by ownerId + appContext so Pro and Team are isolated.
   */
  async getFlowsForPicker(userId, appType) {
    return prisma.flow.findMany({
      where: {
        ownerId: userId,
        appContext: appType,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        thumbnail: true,
        updatedAt: true,
        createdAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });
  }
}

module.exports = new FlowLimitService();
