"use strict";

const { Prisma } = require("@prisma/client");

/**
 * Write `flows.marked_for_downgrade` WITHOUT touching `updated_at`.
 *
 * bug-119 (owner-reported, 2026-08-09): after resolving an over-limit lock, all
 * seven locked flows showed "Edited Just now" and jumped to the TOP of MY FLOWS,
 * Recents and the dashboard's Recent Flows — pushing the ten flows the user had
 * just chosen to KEEP below the fold. Their `created_at` were the oldest in the
 * set; only `updated_at` had moved, to the exact second the picker ran.
 *
 * Cause: `Flow.updatedAt` is `@updatedAt`, so Prisma stamps it on ANY update —
 * including a bulk administrative flag change that the user did not make. The
 * lock was being recorded as an edit, so every recency-ordered list believed
 * the locked flows were the freshest work in the workspace.
 *
 * Locking is not editing. These helpers issue plain SQL so the column keeps the
 * real last-edited time. They return PrismaPromises, so they compose inside
 * `$transaction([...])` exactly like an `updateMany` would.
 *
 * ⚠️ Deliberately NOT applied to the paths that also move `deletedAt`
 * (trash/restore on downgrade — `pro.service`, `flow.service.confirmSelection`).
 * Those change the row's lifecycle, not just a flag, and whether that should
 * count as an edit is a separate question. Same class of issue; unfixed on
 * purpose rather than swept in untested.
 */

/** Set/clear the flag on an explicit id list. No-op on an empty list. */
function setDowngradeFlagByIds(client, ids, value) {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  return client.$executeRaw`
    UPDATE flows SET marked_for_downgrade = ${value}
    WHERE id IN (${Prisma.join(ids)})`;
}

/**
 * Clear the flag across a workspace's live flows in one app scope.
 *
 * The app boundary mirrors `workspaceScope.appScope`: the Pro app is strictly
 * `pro`, every other app covers `free` + `team` (the free-fold — bug-116). A
 * narrower clear here would leave a free-era flow carrying a stale flag from a
 * previous cycle, showing as at-risk forever.
 */
function clearDowngradeFlagInScope(client, workspaceId, appContext) {
  return appContext === "pro"
    ? client.$executeRaw`
        UPDATE flows SET marked_for_downgrade = false
        WHERE workspace_id = ${workspaceId}
          AND app_context = 'pro'::"UserVersion"
          AND deleted_at IS NULL`
    : client.$executeRaw`
        UPDATE flows SET marked_for_downgrade = false
        WHERE workspace_id = ${workspaceId}
          AND app_context IN ('free'::"UserVersion", 'team'::"UserVersion")
          AND deleted_at IS NULL`;
}

module.exports = { setDowngradeFlagByIds, clearDowngradeFlagInScope };
