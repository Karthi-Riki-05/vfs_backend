const { prisma } = require("../lib/prisma");
const logger = require("../utils/logger");

const PLAN_CREDITS = {
  free: 20,
  pro: 200, // new Pro ($5) — legacy Pro ($1) gets 100 via isLegacyPro flag
  proLegacy: 100,
  team: 300,
};

// Billing-user resolver: in a team workspace, AI credit reads and deductions
// target the TEAM OWNER's balance (so a free member gets the team's 300-
// credit pool, not their own 20). The caller must be a verified member/
// owner of the team; otherwise we silently fall back to the caller's own
// balance so we never leak a team's credits to a non-member.
async function resolveBillingUser(
  userId,
  activeTeamId,
  explicitAppContext = null,
) {
  if (!activeTeamId) {
    // When the caller explicitly requests the pro context (e.g. the Pro app
    // sends x-app-context: pro), honour it — never silently redirect a pro
    // user to their team pool just because they also own a team subscription.
    if (explicitAppContext === "pro") {
      return { userId, appContext: "pro" };
    }

    // No explicit team context was supplied (e.g. the mobile forced-team
    // WebView, the diagram editor opened before a workspace switch, or a
    // Team owner who simply never switched). If the caller OWNS an active
    // Team subscription, bill their own team pool. Centralizing this here
    // means display (getBalance), gating (hasCredits) AND spend
    // (deductCredit) all agree — otherwise the editor would SHOW 300 but
    // DEDUCT from the personal 20.
    const ownsTeamPlan = await prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ["active", "trialing"] },
        plan: { tier: { gte: 2 } },
      },
      select: { id: true },
    });
    return ownsTeamPlan
      ? { userId, appContext: "team" }
      : { userId, appContext: null };
  }
  const team = await prisma.team.findFirst({
    where: { id: activeTeamId, deletedAt: null },
    select: { teamOwnerId: true, appContext: true },
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
  // Bill the workspace's own pool. A Pro team (appContext='pro') draws from the
  // owner's lifetime Pro balance (200); every other team draws from the Team
  // pool (300). Previously this was hardcoded to 'team', which mis-billed Pro
  // teams against the team pool — see Pro-app audit AUDIT 5.
  const billingContext = team.appContext === "pro" ? "pro" : "team";
  return { userId: team.teamOwnerId, appContext: billingContext };
}

function getNextResetDate() {
  const next = new Date();
  next.setMonth(next.getMonth() + 1);
  next.setDate(1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function planCreditsFor(appContext, isLegacyPro = false) {
  if (appContext === "pro" && isLegacyPro) return PLAN_CREDITS.proLegacy;
  return PLAN_CREDITS[appContext] || PLAN_CREDITS.free;
}

async function getOrCreateBalance(userId, appContext = "team") {
  // Composite (userId, appContext) key — separate balance per workspace.
  // A user can hold a Free balance AND a Team balance independently;
  // credits never leak between apps.
  let balance = await prisma.aiCreditBalance.findUnique({
    where: { userId_appContext: { userId, appContext } },
  });

  if (!balance) {
    balance = await prisma.aiCreditBalance.create({
      data: {
        userId,
        planCredits: planCreditsFor(appContext),
        addonCredits: 0,
        // Only Team plans expire/refill. Free = one-time grant (never
        // refills); Pro = lifetime purchase (never expires). Both keep
        // planResetsAt = null so no refill is ever scheduled.
        planResetsAt: appContext === "team" ? getNextResetDate() : null,
        appContext,
      },
    });
  }

  // Refill plan credits if the reset date has passed — TEAM only.
  // Free (one-time) and Pro (lifetime) never refill.
  if (
    balance.appContext === "team" &&
    balance.planResetsAt &&
    new Date() > balance.planResetsAt
  ) {
    // Seat-aware refill: monthly teams refill to seats × 60. Yearly teams
    // return null here — their renewal is handled by the invoice.paid
    // webhook, so we must NOT clobber the upfront yearly grant with the
    // flat 300 baseline.
    const refill = await teamCreditsForOwner(userId);
    if (refill !== null) {
      balance = await prisma.aiCreditBalance.update({
        where: { userId_appContext: { userId, appContext } },
        data: {
          planCredits: refill,
          planResetsAt: getNextResetDate(),
        },
      });
    }
  }

  return balance;
}

async function hasCredits(userId, appContext = "team", activeTeamId = null) {
  const billing = await resolveBillingUser(userId, activeTeamId, appContext);
  const ctx = billing.appContext || appContext;
  const balance = await getOrCreateBalance(billing.userId, ctx);
  return balance.planCredits + balance.addonCredits > 0;
}

async function deductCredit(
  userId,
  feature,
  model,
  appContext = "team",
  activeTeamId = null,
) {
  // Deductions hit the billing user (team owner in team context, self in
  // personal). Usage audit row still records the ACTING user so you can
  // see who spent which team credits.
  const billing = await resolveBillingUser(userId, activeTeamId, appContext);
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
      where: {
        userId_appContext: { userId: billing.userId, appContext: ctx },
      },
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
  appContext = "team",
  activeTeamId = null,
) {
  const billing = await resolveBillingUser(userId, activeTeamId, appContext);
  const ctx = billing.appContext || appContext;
  await getOrCreateBalance(billing.userId, ctx);
  return prisma.aiCreditBalance.update({
    where: { userId_appContext: { userId: billing.userId, appContext: ctx } },
    data: { addonCredits: { increment: credits } },
  });
}

async function getBalance(userId, appContext = "team", activeTeamId = null) {
  // resolveBillingUser now centralizes the team-owner fallback, so display,
  // gating and deduction all resolve to the same (team) pool. See C8.
  const billing = await resolveBillingUser(userId, activeTeamId, appContext);
  const ctx = billing.appContext || appContext;
  const balance = await getOrCreateBalance(billing.userId, ctx);
  return {
    planCredits: balance.planCredits,
    addonCredits: balance.addonCredits,
    totalCredits: balance.planCredits + balance.addonCredits,
    planResetsAt: balance.planResetsAt,
    appContext: balance.appContext,
    // The plan's full grant (progress-bar denominator). Team plans are
    // seat-scaled (seats × 60/mo or seats × 800/yr), so the frontend can't
    // hardcode it.
    planLimit: await planLimitFor(billing.userId, ctx),
    // Lets the frontend label "Team credits" vs "Personal credits".
    source: billing.userId === userId ? "self" : "team",
  };
}

// Full plan grant for a user in a given context — used as the display
// denominator ("X of Y credits used").
async function planLimitFor(userId, ctx) {
  if (ctx === "team") {
    const sub = await prisma.subscription.findFirst({
      where: { userId, status: "active" },
      select: { usersCount: true, productType: true },
    });
    if (!sub) return PLAN_CREDITS.team;
    const seats = sub.usersCount || 5;
    return sub.productType === "team_yearly"
      ? seats * TEAM_CREDITS_PER_SEAT_YEARLY
      : seats * TEAM_CREDITS_PER_SEAT_MONTHLY;
  }
  if (ctx === "pro") {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { isLegacyPro: true },
    });
    return planCreditsFor("pro", u?.isLegacyPro);
  }
  return planCreditsFor(ctx);
}

// Credits per seat per month for team plans (60/seat/month).
const TEAM_CREDITS_PER_SEAT_MONTHLY = 60;
// Credits per seat per year for yearly team plans (800/seat/year).
const TEAM_CREDITS_PER_SEAT_YEARLY = 800;

async function teamCreditsForOwner(userId) {
  // Look up the active subscription to get seat count and billing period.
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: "active" },
    select: { usersCount: true, productType: true, expiresAt: true },
  });
  if (!sub) return PLAN_CREDITS.team; // fallback: 5-seat baseline (300)
  const seats = sub.usersCount || 5;
  // Yearly teams are reset by the invoice.paid webhook, not the monthly cron.
  // Return null to signal that resetAllPlanCredits should skip this user.
  if (sub.productType === "team_yearly") return null;
  return seats * TEAM_CREDITS_PER_SEAT_MONTHLY;
}

async function resetAllPlanCredits() {
  // Fetch all users with their active subscriptions in one query to avoid N+1.
  const users = await prisma.user.findMany({
    select: {
      id: true,
      currentVersion: true,
      isLegacyPro: true,
      subscription: {
        select: {
          usersCount: true,
          productType: true,
          expiresAt: true,
          status: true,
        },
      },
    },
  });

  let resetCount = 0;
  let skippedYearly = 0;

  for (const user of users) {
    const appContext = user.currentVersion || "free";

    // ONLY Team plans reset on the monthly cron. Free = one-time grant that
    // never refills; Pro = lifetime purchase that never expires. Both have
    // planResetsAt = null and must be skipped entirely here.
    if (appContext !== "team") continue;

    const sub = user.subscription;
    // Skip users without an active team subscription
    if (!sub || sub.status !== "active") continue;
    // Yearly teams are refreshed via invoice.paid webhook — skip in monthly cron
    if (sub.productType === "team_yearly") {
      skippedYearly++;
      continue;
    }
    const seats = sub.usersCount || 5;
    const credits = seats * TEAM_CREDITS_PER_SEAT_MONTHLY;
    // planResetsAt: next billing date (subscription expiry) so the balance
    // aligns with the actual renewal cycle, not a generic calendar month.
    const planResetsAt = sub.expiresAt || getNextResetDate();
    await prisma.aiCreditBalance.upsert({
      where: { userId_appContext: { userId: user.id, appContext: "team" } },
      update: { planCredits: credits, planResetsAt },
      create: {
        userId: user.id,
        planCredits: credits,
        addonCredits: 0,
        planResetsAt,
        appContext: "team",
      },
    });

    resetCount++;
  }

  logger.info(
    `[AiCredit] Monthly reset complete: ${resetCount} users reset, ${skippedYearly} yearly teams skipped`,
  );
  return resetCount;
}

// Grant initial team AI credits when a subscription is first activated.
// Monthly: seats × 60, resets next month (cron). Yearly: the FULL year
// upfront (seats × 800), resets at the yearly renewal (invoice.paid webhook).
async function grantTeamCredits(userId, seats, plan, expiresAt = null) {
  const yearly = plan === "yearly";
  const credits = yearly
    ? seats * TEAM_CREDITS_PER_SEAT_YEARLY
    : seats * TEAM_CREDITS_PER_SEAT_MONTHLY;

  const nextReset = expiresAt
    ? new Date(expiresAt)
    : yearly
      ? (() => {
          const d = new Date();
          d.setFullYear(d.getFullYear() + 1);
          return d;
        })()
      : getNextResetDate();
  await prisma.aiCreditBalance.upsert({
    where: { userId_appContext: { userId, appContext: "team" } },
    update: { planCredits: credits, planResetsAt: nextReset },
    create: {
      userId,
      planCredits: credits,
      addonCredits: 0,
      planResetsAt: nextReset,
      appContext: "team",
    },
  });
  logger.info(
    `[AiCredit] Granted ${credits} team credits to owner ${userId} (${seats} seats, ${plan})`,
  );
}

module.exports = {
  getBalance,
  hasCredits,
  deductCredit,
  addAddonCredits,
  resetAllPlanCredits,
  grantTeamCredits,
  PLAN_CREDITS,
  TEAM_CREDITS_PER_SEAT_MONTHLY,
  TEAM_CREDITS_PER_SEAT_YEARLY,
};
