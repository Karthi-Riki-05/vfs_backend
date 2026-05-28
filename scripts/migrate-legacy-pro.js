/**
 * One-time migration: mark all users who purchased Pro before the $5 pricing
 * change as isLegacyPro=true so they keep 100 AI credits/month instead of 200.
 *
 * Run inside the backend container AFTER running `prisma db push` for the
 * isLegacyPro column:
 *   docker compose exec backend node scripts/migrate-legacy-pro.js
 */

const { prisma } = require("../src/lib/prisma");
const logger = require("../src/utils/logger");

async function run() {
  const result = await prisma.user.updateMany({
    where: { proPurchasedAt: { not: null }, isLegacyPro: false },
    data: { isLegacyPro: true },
  });
  logger.info(
    `[migrate-legacy-pro] Marked ${result.count} users as isLegacyPro=true`,
  );
  console.log(`Done. Marked ${result.count} users as legacy Pro.`);
}

run()
  .catch((err) => {
    console.error("Migration failed:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
