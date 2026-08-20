const { prisma } = require("../lib/prisma");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const notificationPreference = require("./notificationPreference.service");

// bug-029: `Notification.type` is a free-form Prisma String, not a real
// enum — converting it would need a migration + backfill + touching every
// call site at once, too risky for a cosmetic-drift concern. This is a
// warn-only typo catcher instead: built from an actual grep of every
// literal `type` string passed to createNotification across the codebase
// (not from documentation, which this session repeatedly showed drifts from
// reality). Never blocks creation — logging a warning is the only effect.
const KNOWN_TYPES = new Set([
  "SECURITY_ALERT",
  "flow_addon_expired",
  "flow_addon_grace_expired",
  "flow_addon_payment_failed",
  "flow_pack_expired",
  "flow_pack_grace",
  "flow_pack_7day",
  "flow_pack_3day",
  "flow_pack_1day",
  "flow_picker_required",
  // bug-120: an owner resolving their over-limit lock can lock a MEMBER's flow;
  // the member is told rather than left with silently read-only work.
  "flow_locked_by_owner",
  "flow_updated",
  "subscription_activated",
  "subscription_cancelled",
  "subscription_expired",
  "subscription_payment_failed",
  "team_invite",
  "team_invite_declined",
  "team_member_joined",
  "team_member_removed",
]);

/**
 * Push a freshly-created notification to the user's live socket session(s).
 *
 * Every connected socket joins a personal room `user:<userId>` (see
 * presenceEvents.js), so emitting to that room reaches every tab/device the
 * user has open and NO ONE ELSE — the targeting the P1 brief requires.
 *
 * We send the notification's own { workspaceId, appContext } so the client can
 * decide whether it belongs to the workspace it is currently viewing before
 * bumping the badge. The client ALSO refetches `/notifications/count`, which
 * is scoped server-side by the X-Workspace-Context / X-App-Context headers, so the
 * count stays correct even if the client's local context guess is stale.
 *
 * Best-effort: getIO() is null in tests and before Socket.IO boots, and a
 * socket failure must never roll back a persisted notification. Lazy-required
 * to avoid a require cycle at module load.
 */
function emitNotification(notification) {
  try {
    const { getIO } = require("../socket");
    const io = getIO();
    if (!io) return; // socket layer not initialised (e.g. unit tests)
    io.to(`user:${notification.userId}`).emit("notification:new", {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      actionUrl: notification.actionUrl,
      workspaceId: notification.workspaceId,
      appContext: notification.appContext,
      createdAt: notification.createdAt,
    });
  } catch (err) {
    logger.warn(`[Notification] real-time emit failed: ${err.message}`);
  }
}

/**
 * Build the strict { ownerId, workspaceId } workspace boundary for a query.
 *
 *   Team context      → { userId, workspaceId }
 *   Personal (pro)     → { userId, workspaceId: null, appContext: "pro" }
 *   Personal (team/free) → { userId, workspaceId: null, appContext: { in: ["free","team"] } }
 *
 * The Free Fold: in the personal Team-App container, free notifications fold
 * in alongside team ones (matching the flow/shape/project workspace scope in
 * flow.service._workspaceScope — `appContext: { in: ["team","free"] }`). The
 * Pro app stays strictly isolated so pro notifications never bleed into the
 * team-app feed and vice-versa (cross-app isolation).
 *
 * Never userId alone (would leak the other workspace's notifications) and
 * never workspaceId alone (DATA-LOSS-001 / ISOLATION P0). A caller MUST supply a
 * context — we fail closed rather than return everything the user owns.
 */
function buildScope({ userId, workspaceId = null, appContext = null }) {
  if (!userId) {
    throw new AppError(
      "userId is required to scope notifications",
      400,
      "NOTIF_SCOPE_REQUIRED",
    );
  }
  if (!workspaceId && !appContext) {
    throw new AppError(
      "A workspace context (workspaceId or appContext) is required to read notifications",
      400,
      "NOTIF_CONTEXT_REQUIRED",
    );
  }

  // owner-as-workspace (2026-08-07): a personal notification carries the
  // recipient's OWN id rather than null, so there is no null branch any more —
  // "no workspace supplied" simply means the caller's own workspace.
  const where = { userId };
  if (workspaceId) {
    where.workspaceId = workspaceId; // explicit workspace — strict isolation
    return where;
  }

  where.workspaceId = userId;
  if (appContext === "pro") {
    // Pro app: strict isolation — only the user's pro notifications.
    where.appContext = "pro";
  } else {
    // Team-App container: free folds into team. Surface both so a free user
    // who upgrades (same account) keeps a continuous feed.
    where.appContext = { in: ["free", "team"] };
  }
  return where;
}

async function createNotification(
  userId,
  type,
  title,
  message,
  actionUrl = null,
  metadata = null,
  appContext = "team",
  workspaceId = null,
  opts = {},
) {
  // bug-029: warn-only typo catcher — never blocks creation.
  if (!KNOWN_TYPES.has(type)) {
    logger.warn(
      `[Notification] unrecognized type "${type}" — check for a typo or add it to KNOWN_TYPES in notification.service.js`,
    );
  }

  // bug-019: per-category opt-out. Fail-open (defaults to enabled) so a
  // preference-lookup problem can never silently drop a real notification —
  // isChannelEnabled already fails open internally; the .catch here is
  // belt-and-suspenders for this specific call site.
  const enabled = await notificationPreference
    .isChannelEnabled(userId, type, "inApp", appContext)
    .catch(() => true);
  if (!enabled) return null;

  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      actionUrl,
      metadata,
      appContext,
      // owner-as-workspace (2026-08-07): a personal notification carries the
      // RECIPIENT'S OWN id, never null — `buildScope` reads personal rows with
      // `workspaceId = userId`, so a null written here could never be matched
      // and the notification would be invisible forever. Callers still pass
      // null to mean "personal"; normalise it at this one choke point rather
      // than at each of the ~40 call sites.
      workspaceId: workspaceId || userId,
    },
  });

  // P1: deliver in real time so the bell updates instantly instead of on the
  // next 60s poll. Non-blocking, fail-open.
  emitNotification(notification);

  // ── Optional FCM push ───────────────────────────────────────────────────
  // OPT-IN (`opts.push`), not automatic. The bell and the push are two
  // deliberate channels: the bell is workspace-scoped by design (see
  // buildScope) while a push reaches the user wherever they are, so five
  // services already pair createNotification with an explicit
  // push.sendPushToUser. Pushing unconditionally here would double-notify
  // every one of them, and would also push ~17 other call sites that were
  // never written expecting it. Enable it per type, on purpose.
  //
  // ALWAYS via push.service, never fcm.service directly: only the facade
  // applies the user's per-category preference, quiet hours and rate limits.
  // `type` doubles as the preference category — that is the contract
  // isChannelEnabled documents ("the Notification.type / push category
  // string"), so passing anything else would silently bypass the opt-out.
  if (opts.push) {
    try {
      const push = require("./push.service");
      const res = await push.sendPushToUser(
        userId,
        {
          title,
          body: opts.pushBody || message,
          data: {
            type,
            ...(actionUrl ? { url: actionUrl } : {}),
            ...(opts.pushData || {}),
          },
        },
        appContext,
        type,
      );
      if (res && res.skipped) {
        logger.info(
          `[Notification] push for "${type}" skipped (${res.reason}) — bell row still created`,
        );
      }
    } catch (err) {
      // Never fatal: the bell row is already written and is the source of
      // truth. A missing banner must not fail the caller's business logic.
      logger.error(
        `[Notification] push for "${type}" failed: ${err.message} — bell row unaffected`,
      );
    }
  }

  return notification;
}

async function getUserNotifications(
  userId,
  {
    unreadOnly = false,
    limit = 20,
    appContext = null,
    workspaceId = null,
  } = {},
) {
  const where = buildScope({ userId, workspaceId, appContext });
  if (unreadOnly) where.isRead = false;
  return prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });
}

async function markAsRead(notificationId, userId) {
  // Scope by userId so a notification can't be marked from another account.
  const updated = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true },
  });
  return { count: updated.count };
}

async function markAllAsRead(
  userId,
  { appContext = null, workspaceId = null } = {},
) {
  // Scope to the active workspace so "mark all read" in one context never
  // clears the other workspace's unread badge.
  const where = buildScope({ userId, workspaceId, appContext });
  where.isRead = false;
  const updated = await prisma.notification.updateMany({
    where,
    data: { isRead: true },
  });
  return { count: updated.count };
}

async function getUnreadCount(
  userId,
  { appContext = null, workspaceId = null } = {},
) {
  const where = buildScope({ userId, workspaceId, appContext });
  where.isRead = false;
  return prisma.notification.count({ where });
}

/**
 * Physically delete a single notification — strict IDOR protection.
 *
 * Scoped by { id, userId } via deleteMany so a user can only ever remove their
 * OWN row; a mismatched (id, userId) deletes nothing and returns { count: 0 }
 * rather than throwing (idempotent for the client). No workspace context is
 * needed: the (id, userId) pair already uniquely identifies the row.
 */
async function deleteNotification(notificationId, userId) {
  const deleted = await prisma.notification.deleteMany({
    where: { id: notificationId, userId },
  });
  return { count: deleted.count };
}

/**
 * Physically delete every notification in the caller's ACTIVE workspace.
 *
 * Reuses buildScope() so the delete respects the exact same boundary as the
 * list/count reads: inside the Team App it only touches the active team's (or
 * the folded free/team personal) notifications and NEVER the user's private
 * Pro-App feed, and vice-versa (ISOLATION P0 / DATA-LOSS-001).
 */
async function deleteAllNotifications(
  userId,
  { appContext = null, workspaceId = null } = {},
) {
  const where = buildScope({ userId, workspaceId, appContext });
  const deleted = await prisma.notification.deleteMany({ where });
  return { count: deleted.count };
}

/**
 * Cron-driven cleanup (bug-024): permanently deletes READ notifications
 * older than `days` (default 30), across every user and workspace — this is
 * unscoped by design, unlike every other function in this file, because a
 * cleanup sweep has no single caller's workspace boundary to respect.
 *
 * Only prunes `isRead: true` rows — a notification the user hasn't seen yet
 * is never deleted by age alone, regardless of how old it is.
 */
async function pruneReadNotifications(days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const deleted = await prisma.notification.deleteMany({
    where: { isRead: true, createdAt: { lt: cutoff } },
  });
  return { count: deleted.count };
}

module.exports = {
  createNotification,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  deleteNotification,
  deleteAllNotifications,
  pruneReadNotifications,
};
