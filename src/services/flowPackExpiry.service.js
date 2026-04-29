// Flow-pack lifecycle cron: notifications, grace, expiry, flow picker
// trigger, and trash purge for marked-for-downgrade flows.
//
// Idempotent — every step is gated by a flag (notified*Days, status,
// activeFlowPackId) so re-runs don't double-send or double-process.

const { prisma } = require("../lib/prisma");
const logger = require("../utils/logger");
const { sendEmail, emailTemplates } = require("../utils/email");
const notificationService = require("./notification.service");
const push = require("./push.service");

function pushSafe(userId, notification) {
  // Fire-and-forget: never let a missing FCM token break the cron.
  push
    .sendPushToUser(userId, notification)
    .catch((err) => logger.warn(`[push] flow-pack notify: ${err.message}`));
}

const DAY = 24 * 3600 * 1000;
const PACK_LABEL = (p) => (p.isUnlimited ? "Unlimited Flows" : "50 Flows pack");

async function runDailyCheck() {
  const now = new Date();
  const summary = {
    notified7Days: 0,
    notified3Days: 0,
    notified1Day: 0,
    movedToGrace: 0,
    expiredNoPicker: 0,
    expiredWithPicker: 0,
    trashPurged: 0,
  };

  // STEP A — 7 days out
  await notifyWindow({
    flag: "notified7Days",
    type: "flow_pack_7day",
    minOffset: 6 * DAY,
    maxOffset: 7 * DAY,
    template: emailTemplates.flowPack7Days,
    title: "Flow pack expires in 7 days",
    daysLeft: 7,
    now,
    summary,
    counter: "notified7Days",
  });

  // STEP B — 3 days out
  await notifyWindow({
    flag: "notified3Days",
    type: "flow_pack_3day",
    minOffset: 2 * DAY,
    maxOffset: 3 * DAY,
    template: emailTemplates.flowPack3Days,
    title: "Flow pack expires in 3 days",
    daysLeft: 3,
    now,
    summary,
    counter: "notified3Days",
  });

  // STEP C — 1 day out
  await notifyWindow({
    flag: "notified1Day",
    type: "flow_pack_1day",
    minOffset: 0,
    maxOffset: 1 * DAY,
    template: emailTemplates.flowPack1Day,
    title: "Flow pack expires tomorrow",
    daysLeft: 1,
    now,
    summary,
    counter: "notified1Day",
  });

  // STEP D — packs that expired but are still inside the grace window.
  const gracePacks = await prisma.proFlowPurchase.findMany({
    where: {
      status: "active",
      expiresAt: { lte: now },
      gracePeriodEndsAt: { gt: now },
    },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  for (const p of gracePacks) {
    await prisma.proFlowPurchase.update({
      where: { id: p.id },
      data: { status: "grace" },
    });
    if (p.user?.email && emailTemplates.flowPackGrace) {
      const tpl = emailTemplates.flowPackGrace(
        p.user,
        PACK_LABEL(p),
        p.gracePeriodEndsAt,
      );
      sendEmail({ to: p.user.email, ...tpl }).catch(() => {});
    }
    await notificationService.createNotification(
      p.userId,
      "flow_pack_grace",
      "Pack expired — grace period started",
      `Renew before ${p.gracePeriodEndsAt.toLocaleDateString()} to keep all flows.`,
      "/dashboard/subscription",
      { packId: p.id },
    );
    pushSafe(p.userId, {
      title: "Flow pack expired",
      body: `Renew before ${p.gracePeriodEndsAt.toLocaleDateString()} to keep all flows.`,
      data: { type: "flow_pack", url: "/dashboard/subscription" },
    });
    summary.movedToGrace++;
  }

  // STEP E — past grace period: enforce downgrade.
  const expired = await prisma.proFlowPurchase.findMany({
    where: {
      status: { in: ["active", "grace"] },
      gracePeriodEndsAt: { lte: now },
    },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  for (const p of expired) {
    await downgradeUser(p, summary);
  }

  // STEP F — hard purge flows that have been in trash for 30+ days
  // because of a downgrade. We only purge ones we put there
  // (markedForDowngrade=true) — the existing /cron/purge-trash handles
  // the general 30-day trash sweep for everything else.
  const purgeBefore = new Date(now.getTime() - 30 * DAY);
  const purged = await prisma.flow.deleteMany({
    where: {
      markedForDowngrade: true,
      deletedAt: { not: null, lte: purgeBefore },
    },
  });
  summary.trashPurged = purged.count;

  logger.info(`[flowPackExpiry] ${JSON.stringify(summary)}`);
  return summary;
}

async function notifyWindow({
  flag,
  type,
  minOffset,
  maxOffset,
  template,
  title,
  daysLeft,
  now,
  summary,
  counter,
}) {
  const lower = new Date(now.getTime() + minOffset);
  const upper = new Date(now.getTime() + maxOffset);
  const packs = await prisma.proFlowPurchase.findMany({
    where: {
      status: "active",
      expiresAt: { gt: lower, lte: upper },
      [flag]: false,
    },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  for (const p of packs) {
    if (p.user?.email && template) {
      const tpl = template(p.user, PACK_LABEL(p), p.expiresAt);
      sendEmail({ to: p.user.email, ...tpl }).catch(() => {});
    }
    await notificationService.createNotification(
      p.userId,
      type,
      title,
      `Your ${PACK_LABEL(p)} expires on ${p.expiresAt.toLocaleDateString()}.`,
      "/dashboard/subscription",
      { packId: p.id, expiresAt: p.expiresAt },
    );
    pushSafe(
      p.userId,
      push.builders.flowPackExpiring({
        packLabel: PACK_LABEL(p),
        daysLeft: daysLeft || 1,
      }),
    );
    await prisma.proFlowPurchase.update({
      where: { id: p.id },
      data: { [flag]: true },
    });
    summary[counter]++;
  }
}

async function downgradeUser(pack, summary) {
  const userId = pack.userId;

  // 1) Mark pack as fully expired and clear user pointers.
  await prisma.proFlowPurchase.update({
    where: { id: pack.id },
    data: { status: "expired" },
  });
  await prisma.user.update({
    where: { id: userId },
    data: {
      activeFlowPackId: null,
      flowPackExpiresAt: null,
      proUnlimitedFlows: false,
      proAdditionalFlowsPurchased: 0,
      proFlowLimit: 10,
    },
  });

  // 2) Decide whether the user needs the picker.
  const flows = await prisma.flow.findMany({
    where: { ownerId: userId, teamId: null, deletedAt: null },
    select: {
      id: true,
      updatedAt: true,
      _count: { select: { flowShares: true } },
    },
  });

  if (flows.length <= 10) {
    summary.expiredNoPicker++;
    await notificationService.createNotification(
      userId,
      "flow_pack_expired",
      "Flow pack expired",
      "You're back on the free plan with 10 flows. Renew anytime.",
      "/dashboard/subscription",
      { packId: pack.id },
    );
    pushSafe(userId, {
      title: "Flow pack expired",
      body: "You're back on the free plan with 10 flows. Renew anytime.",
      data: { type: "flow_pack", url: "/dashboard/subscription" },
    });
    return;
  }

  // 3) Picker phase. Order: shared first, then most-recently updated.
  flows.sort((a, b) => {
    const aShared = a._count.flowShares > 0 ? 1 : 0;
    const bShared = b._count.flowShares > 0 ? 1 : 0;
    if (aShared !== bShared) return bShared - aShared;
    return b.updatedAt - a.updatedAt;
  });
  const safeIds = new Set(flows.slice(0, 10).map((f) => f.id));
  const downgradeIds = flows.slice(10).map((f) => f.id);

  if (downgradeIds.length > 0) {
    await prisma.flow.updateMany({
      where: { id: { in: downgradeIds } },
      data: { markedForDowngrade: true },
    });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isInFlowPickerPhase: true },
  });

  // Email + in-app notification.
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  if (u?.email && emailTemplates.flowPickerRequired) {
    const tpl = emailTemplates.flowPickerRequired(u, flows.length);
    sendEmail({ to: u.email, ...tpl }).catch(() => {});
  }
  await notificationService.createNotification(
    userId,
    "flow_picker_required",
    "Action required: select 10 flows",
    `Your flow pack expired and you have ${flows.length} flows. Pick 10 to keep — the rest move to trash for 30 days.`,
    "/dashboard/flows",
    { packId: pack.id, flowCount: flows.length },
  );
  pushSafe(userId, push.builders.flowPackExpired());
  summary.expiredWithPicker++;
  // Suppress the unused-var lint — `safeIds` is informational/diagnostic.
  void safeIds;
}

module.exports = { runDailyCheck };
