const { prisma } = require("../lib/prisma");
const logger = require("../utils/logger");

const PLAN_CREDITS = {
  free: 20,
  pro: 100,
  team: 300,
};

// Billing-user resolver: in a team workspace, AI credit reads and deductions
// target the TEAM OWNER's balance (so a free member gets the team's 300-
// credit pool, not their own 20). The caller must be a verified member/
// owner of the team; otherwise we silently fall back to the caller's own
// balance so we never leak a team's credits to a non-member.
async function resolveBillingUser(userId, activeTeamId) {
  if (!activeTeamId) return { userId, appContext: null };
  const team = await prisma.team.findFirst({
    where: { id: activeTeamId, deletedAt: null },
    select: { teamOwnerId: true },
  });
  if (!team) return { userId, appContext: null };
  const [isMember, isOwner] = await Promise.all([
    prisma.teamMember.findFirst({
      where: { teamId: activeTeamId, userId },
      select: { id: true },
    }),
    Promise.resolve(team.teamOwnerId === userId),
  ]);
  if (!isMember && !isOwner) return { userId, appContext: null };
  return { userId: team.teamOwnerId, appContext: "team" };
}

function getNextResetDate() {
  const next = new Date();
  next.setMonth(next.getMonth() + 1);
  next.setDate(1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function planCreditsFor(appContext) {
  return PLAN_CREDITS[appContext] || PLAN_CREDITS.free;
}

async function getOrCreateBalance(userId, appContext = "free") {
  let balance = await prisma.aiCreditBalance.findUnique({ where: { userId } });

  if (!balance) {
    balance = await prisma.aiCreditBalance.create({
      data: {
        userId,
        planCredits: planCreditsFor(appContext),
        addonCredits: 0,
        planResetsAt: getNextResetDate(),
        appContext,
      },
    });
  }

  // Refill plan credits if the reset date has passed
  if (balance.planResetsAt && new Date() > balance.planResetsAt) {
    balance = await prisma.aiCreditBalance.update({
      where: { userId },
      data: {
        planCredits: planCreditsFor(appContext),
        planResetsAt: getNextResetDate(),
        appContext,
      },
    });
  }

  return balance;
}

async function hasCredits(userId, appContext = "free", activeTeamId = null) {
  const billing = await resolveBillingUser(userId, activeTeamId);
  const ctx = billing.appContext || appContext;
  const balance = await getOrCreateBalance(billing.userId, ctx);
  return balance.planCredits + balance.addonCredits > 0;
}

async function deductCredit(
  userId,
  feature,
  model,
  appContext = "free",
  activeTeamId = null,
) {
  // Deductions hit the billing user (team owner in team context, self in
  // personal). Usage audit row still records the ACTING user so you can
  // see who spent which team credits.
  const billing = await resolveBillingUser(userId, activeTeamId);
  const ctx = billing.appContext || appContext;
  const balance = await getOrCreateBalance(billing.userId, ctx);
  const total = balance.planCredits + balance.addonCredits;

  if (total <= 0) {
    return {
      success: false,
      error: "INSUFFICIENT_CREDITS",
      balance: { planCredits: 0, addonCredits: 0 },
    };
  }

  let planDeduct = 0;
  let addonDeduct = 0;
  let sourceType = "plan";

  if (balance.planCredits > 0) {
    planDeduct = 1;
    sourceType = "plan";
  } else {
    addonDeduct = 1;
    sourceType = "addon";
  }

  const [updated] = await prisma.$transaction([
    prisma.aiCreditBalance.update({
      where: { userId: billing.userId },
      data: {
        planCredits: { decrement: planDeduct },
        addonCredits: { decrement: addonDeduct },
      },
    }),
    // Usage row records the ACTING user (so we can see who spent the
    // team's credit), tagged with the effective workspace context.
    prisma.aiCreditUsage.create({
      data: {
        userId,
        feature,
        creditsUsed: 1,
        sourceType,
        model: model || null,
        appContext: ctx,
      },
    }),
  ]);

  return {
    success: true,
    sourceType,
    remaining: updated.planCredits + updated.addonCredits,
    balance: {
      planCredits: updated.planCredits,
      addonCredits: updated.addonCredits,
    },
  };
}

async function addAddonCredits(
  userId,
  credits,
  appContext = "free",
  activeTeamId = null,
) {
  const billing = await resolveBillingUser(userId, activeTeamId);
  const ctx = billing.appContext || appContext;
  await getOrCreateBalance(billing.userId, ctx);
  return prisma.aiCreditBalance.update({
    where: { userId: billing.userId },
    data: { addonCredits: { increment: credits } },
  });
}

async function getBalance(userId, appContext = "free", activeTeamId = null) {
  const billing = await resolveBillingUser(userId, activeTeamId);
  const ctx = billing.appContext || appContext;
  const balance = await getOrCreateBalance(billing.userId, ctx);
  return {
    planCredits: balance.planCredits,
    addonCredits: balance.addonCredits,
    totalCredits: balance.planCredits + balance.addonCredits,
    planResetsAt: balance.planResetsAt,
    appContext: balance.appContext,
    // Lets the frontend label "Team credits" vs "Personal credits".
    source: billing.userId === userId ? "self" : "team",
  };
}

async function resetAllPlanCredits() {
  const users = await prisma.user.findMany({
    select: { id: true, currentVersion: true },
  });

  let resetCount = 0;
  for (const user of users) {
    const appContext = user.currentVersion || "free";
    await prisma.aiCreditBalance.upsert({
      where: { userId: user.id },
      update: {
        planCredits: planCreditsFor(appContext),
        planResetsAt: getNextResetDate(),
        appContext,
      },
      create: {
        userId: user.id,
        planCredits: planCreditsFor(appContext),
        addonCredits: 0,
        planResetsAt: getNextResetDate(),
        appContext,
      },
    });
    resetCount++;
  }
  logger.info(`[AiCredit] Monthly reset complete: ${resetCount} users`);
  return resetCount;
}

module.exports = {
  getBalance,
  hasCredits,
  deductCredit,
  addAddonCredits,
  resetAllPlanCredits,
  PLAN_CREDITS,
};
