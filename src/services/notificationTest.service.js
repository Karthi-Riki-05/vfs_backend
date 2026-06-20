// Dev/test-only simulation service for the mobile-notification subsystem.
//
// `scheduleExpiry` back-dates a user's subscription and/or flow-pack expiry
// timestamps so the existing expiry-checker crons treat them as lapsing at
// `now + expiryMinutes`. `triggerExpiryCheck` runs those same checkers on
// demand (instead of waiting for the 08:00/09:00 UTC cron) so the whole
// notification flow can be exercised in minutes from Swagger UI.
//
// IMPORTANT: only the flow-pack path emits real FCM pushes (see
// flowPackExpiry.service.js STEP C/D). `expireLapsedSubscriptions` creates an
// in-app notification only — there is no FCM push on subscription expiry today.

const { prisma } = require("../lib/prisma");
const logger = require("../utils/logger");
const AppError = require("../utils/AppError");

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
// expireLapsedSubscriptions sweeps rows where expiresAt < (now - 24h). We
// back-date past that buffer (+1min slack) so the row lapses at the intended
// minute rather than only 24h later.
const SUB_GRACE_MS = DAY;
const SLACK_MS = MINUTE;

async function scheduleExpiry({ email, expiryMinutes, target }) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) {
    throw new AppError(
      `No user found for email ${email}`,
      404,
      "USER_NOT_FOUND",
    );
  }

  const targetMs = Date.now() + expiryMinutes * MINUTE;
  const result = {
    email: user.email,
    userId: user.id,
    expiryMinutes,
    lapsesAt: new Date(targetMs),
    target,
    updated: {},
    warnings: [],
  };

  if (target === "subscription" || target === "both") {
    const sub = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        deletedAt: null,
        status: { in: ["active", "cancelling"] },
      },
      select: { id: true, status: true, expiresAt: true },
    });
    if (sub) {
      const newExpiresAt = new Date(targetMs - SUB_GRACE_MS - SLACK_MS);
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { expiresAt: newExpiresAt },
      });
      result.updated.subscription = {
        id: sub.id,
        previousExpiresAt: sub.expiresAt,
        newExpiresAt,
        note: "In-app notification only — no FCM push on subscription expiry.",
      };
    } else {
      result.warnings.push(
        "No active/cancelling subscription found for this user — nothing to expire.",
      );
    }
  }

  if (target === "flowpack" || target === "both") {
    let pack = await prisma.proFlowPurchase.findFirst({
      where: { userId: user.id, status: { in: ["active", "grace"] } },
      orderBy: { expiresAt: "desc" },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        gracePeriodEndsAt: true,
      },
    });

    // One-click testing: if the user has no active/grace pack, seed a mock one
    // so the flow-pack push pipeline can be exercised end-to-end. Clearly
    // marked as a dev seed (amountCents 0, stripePaymentIntentId 'dev_seed_pack')
    // so it is greppable and never mistaken for a real purchase.
    let seeded = false;
    if (!pack) {
      pack = await prisma.proFlowPurchase.create({
        data: {
          userId: user.id,
          flowCount: 50,
          amountCents: 0,
          packType: "fifty_flows",
          isUnlimited: false,
          status: "active",
          stripePaymentIntentId: "dev_seed_pack",
          expiresAt: new Date(targetMs),
          gracePeriodEndsAt: new Date(targetMs + 3 * DAY),
        },
        select: {
          id: true,
          status: true,
          expiresAt: true,
          gracePeriodEndsAt: true,
        },
      });
      seeded = true;
      logger.info(
        `[notificationTest] seeded mock flow-pack ${pack.id} for ${email}`,
      );
    }

    const newExpiresAt = new Date(targetMs);
    // Keep a future grace window so the checker fires the "grace" push
    // (STEP D) rather than immediately hard-expiring the pack.
    const newGraceEndsAt = new Date(targetMs + 3 * DAY);
    await prisma.proFlowPurchase.update({
      where: { id: pack.id },
      data: {
        status: "active",
        expiresAt: newExpiresAt,
        gracePeriodEndsAt: newGraceEndsAt,
        // Reset notify flags so 7/3/1-day pushes can re-fire on the next run.
        notified7Days: false,
        notified3Days: false,
        notified1Day: false,
      },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { flowPackExpiresAt: newExpiresAt },
    });
    result.updated.flowPack = {
      id: pack.id,
      seeded,
      previousExpiresAt: pack.expiresAt,
      newExpiresAt,
      newGracePeriodEndsAt: newGraceEndsAt,
      note: seeded
        ? "Seeded a mock active flow-pack (no real purchase existed), then back-dated it."
        : "Trigger the check AFTER lapsesAt for the 'expired/grace' FCM push, or BEFORE it for the 'expiring soon' push.",
    };
  }

  logger.info(
    `[notificationTest] scheduleExpiry email=${email} target=${target} ` +
      `minutes=${expiryMinutes} updated=${Object.keys(result.updated).join(",") || "none"}`,
  );
  return result;
}

async function triggerExpiryCheck() {
  // Lazy-require to mirror cron.routes.js and avoid any circular-require risk.
  const subscriptionService = require("./subscription.service");
  const flowPackExpiry = require("./flowPackExpiry.service");

  const subscriptions = await subscriptionService.expireLapsedSubscriptions();
  const flowPack = await flowPackExpiry.runDailyCheck();
  const pastDue = await flowPackExpiry.checkPastDueGrace();

  logger.info(
    `[notificationTest] triggerExpiryCheck subs=${JSON.stringify(subscriptions)} ` +
      `flowPack=${JSON.stringify(flowPack)}`,
  );
  return { subscriptions, flowPack: { ...flowPack, pastDue } };
}

module.exports = { scheduleExpiry, triggerExpiryCheck };
