/**
 * Cleans up users created by automated tests and all related data
 * (cascade handles flows, AI convos, subscriptions, history, etc.).
 *
 * Usage — inside the backend container:
 *   docker compose exec backend node scripts/cleanup-test-users.js           # dry-run
 *   docker compose exec backend node scripts/cleanup-test-users.js --confirm # actually delete
 *
 * Matches emails containing 'pw-test-' (Playwright fixture) or 'e2e-test-'.
 */
const { prisma } = require("../src/lib/prisma");

async function main() {
  const confirm = process.argv.includes("--confirm");

  const where = {
    OR: [
      { email: { contains: "pw-test-" } },
      { email: { contains: "e2e-test-" } },
    ],
  };

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      createdAt: true,
      _count: {
        select: {
          flows: true,
          aiConversations: true,
          aiCreditUsages: true,
          subscriptionHistory: true,
          userActions: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (users.length === 0) {
    console.log("No test users found. Nothing to clean.");
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${users.length} test user(s):`);
  for (const u of users) {
    console.log(
      `  - ${u.email.padEnd(42)} created ${u.createdAt.toISOString().slice(0, 19)} ` +
        `| flows=${u._count.flows} ai=${u._count.aiConversations} ` +
        `history=${u._count.subscriptionHistory}`,
    );
  }

  if (!confirm) {
    console.log("\nDry-run only. Re-run with --confirm to actually delete.");
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.user.deleteMany({ where });
  console.log(`\nDeleted ${result.count} user(s) and all cascaded data.`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
