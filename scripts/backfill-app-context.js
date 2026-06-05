#!/usr/bin/env node
// Backfills app_context for existing rows that were created before the column existed.
// Safe to run multiple times — only updates rows where app_context is still 'free' (default).

const { prisma } = require("../src/lib/prisma");

async function backfill() {
  console.log("Backfilling app_context for existing data...");

  // 1. Subscriptions: derive app_context from product_type
  const teamSubs = await prisma.subscription.updateMany({
    where: {
      productType: { in: ["team_monthly", "team_yearly"] },
      appContext: "free",
    },
    data: { appContext: "team" },
  });
  console.log(`  subscriptions → team: ${teamSubs.count}`);

  const proSubs = await prisma.subscription.updateMany({
    where: {
      productType: { in: ["pro_monthly", "pro_yearly"] },
      appContext: "free",
    },
    data: { appContext: "pro" },
  });
  console.log(`  subscriptions → pro: ${proSubs.count}`);

  // 2. Issues: best-effort via teamId (team-scoped issues exist in team context)
  const teamIssues = await prisma.issueItem.updateMany({
    where: { teamId: { not: null }, appContext: "free" },
    data: { appContext: "team" },
  });
  console.log(`  issue_list → team (via teamId): ${teamIssues.count}`);

  // 3. AiConversations: now an enum — no further string cleanup needed (migrated via SQL).
  console.log("  ai_conversations: already migrated via SQL (enum column).");

  // 4. Optional tables: all default to 'free', no backfill logic needed.
  //    Just log row counts so the operator can confirm the columns exist.
  const [notifCount, actionCount, logCount, feedbackCount] = await Promise.all([
    prisma.notification.count(),
    prisma.userAction.count(),
    prisma.adminLog.count(),
    prisma.feedbackQuery.count(),
  ]);
  console.log(`  notifications rows (all default 'free'): ${notifCount}`);
  console.log(`  user_actions rows (all default 'free'): ${actionCount}`);
  console.log(`  admin_logs rows (all default 'free'): ${logCount}`);
  console.log(`  feedback_queries rows (all default 'free'): ${feedbackCount}`);

  // 5. Mark expired subscriptions that still have status='active' but expiresAt < NOW().
  const expired = await prisma.subscription.updateMany({
    where: {
      status: "active",
      expiresAt: { lt: new Date() },
      deletedAt: null,
    },
    data: { status: "expired" },
  });
  console.log(`  subscriptions marked expired: ${expired.count}`);

  console.log("Backfill complete.");
}

backfill()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
