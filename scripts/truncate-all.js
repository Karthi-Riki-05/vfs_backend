/**
 * TRUNCATE ALL USER DATA
 * ⚠️  DESTRUCTIVE – dev/test environments only.
 * Uses TRUNCATE ... CASCADE so FK order doesn't matter.
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Exact table names from pg_tables (schemaname = 'public')
const TABLES = [
  // ── Auth / session ────────────────────────────────────────────
  "Account",
  "Session",
  "VerificationToken",
  "password_resets",

  // ── Flow data ────────────────────────────────────────────────
  "flow_versions",
  "flow_shares",
  "flow_publishes",
  "flow_group_users",
  "flow_limits",
  "flows",

  // ── Shape data ───────────────────────────────────────────────
  "shapes",
  "shape_groups",

  // ── Projects ─────────────────────────────────────────────────
  "projects",

  // ── Teams ────────────────────────────────────────────────────
  "team_invites",
  "team_members",
  "teams",

  // ── AI / Chat ────────────────────────────────────────────────
  "ai_consent",
  "ai_messages",
  "ai_conversations",
  "ai_credit_balances",
  "ai_credit_usages",
  "chat_files",
  "chat_message_users",
  "chat_messages",
  "chat_group_users",
  "chat_groups",

  // ── Messaging / Conversations ────────────────────────────────
  "message_notifications",
  "messages",
  "conversation_users",
  "conversations",

  // ── Billing / Subscriptions ──────────────────────────────────
  "pro_flow_purchases",
  "add_user_subscriptions",
  "subscription_queue",
  "subscription_history",
  "subscriptions",

  // ── User activity & misc ────────────────────────────────────
  "notifications",
  "user_actions",
  "user_interests",
  "user_free_trials",
  "feedback_queries",
  "vsm_options",
  "issue_list",
  "admin_logs",
  "transaction_logs",
  "offers",
  "promocodes",

  // ── Firebase / App mapping ───────────────────────────────────
  "firebase_users",
  "users_app",

  // ── Users last (most things cascade from here) ───────────────
  "users",
];

async function truncateAll() {
  console.log("⚠️  Starting FULL DATA TRUNCATION...\n");

  // Build one TRUNCATE statement with CASCADE – fastest and FK-safe
  const tableList = TABLES.map(t => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`
  );

  console.log(`✓  Truncated ${TABLES.length} tables.\n`);

  // ── Verify ────────────────────────────────────────────────────
  console.log("── Post-truncation row counts ──────────────────────────────");
  const checks = [
    { label: "users",              fn: () => prisma.user.count() },
    { label: "flows",              fn: () => prisma.flow.count() },
    { label: "projects",           fn: () => prisma.project.count() },
    { label: "shapes",             fn: () => prisma.shape.count() },
    { label: "shape_groups",       fn: () => prisma.shapeGroup.count() },
    { label: "teams",              fn: () => prisma.team.count() },
    { label: "team_members",       fn: () => prisma.teamMember.count() },
    { label: "ai_conversations",   fn: () => prisma.aiConversation.count() },
    { label: "ai_credit_balances", fn: () => prisma.aiCreditBalance.count() },
    { label: "subscriptions",      fn: () => prisma.subscription.count() },
    { label: "notifications",      fn: () => prisma.notification.count() },
    { label: "flow_shares",        fn: () => prisma.flowShare.count() },
  ];

  let allZero = true;
  for (const { label, fn } of checks) {
    const n = await fn();
    const icon = n === 0 ? "✓" : "✘";
    if (n !== 0) allZero = false;
    console.log(`  ${icon}  ${label}: ${n} rows`);
  }

  console.log(
    `\n${allZero
      ? "✅  ALL TABLES EMPTY – truncation complete."
      : "❌  Some tables still have rows – check above."}`
  );
}

truncateAll()
  .catch((err) => {
    console.error("\n❌ Error:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
