/**
 * One-time backfill: grant 200 Pro AI credits to every user who is missing
 * a pro-context credit row.
 *
 * Affected users:
 *   1. Team subscribers whose proPurchasedAt was incorrectly set by the Team
 *      webhook (now fixed) but who never received pro-context credits.
 *   2. Any user with proPurchasedAt set (standalone Pro purchase) but whose
 *      aiCreditBalance row for appContext='pro' is missing (data gap).
 *
 * Safe to run multiple times — skips users who already have the credit row.
 *
 * Run inside the backend container:
 *   docker compose exec backend node scripts/backfill-pro-credits.js
 *
 * Dry-run (no writes):
 *   DRY_RUN=true docker compose exec backend node scripts/backfill-pro-credits.js
 */

"use strict";

const { prisma } = require("../src/lib/prisma");
const { grantProCredits } = require("../src/lib/grantProCredits");

const DRY_RUN = process.env.DRY_RUN === "true";

async function run() {
  console.log(`[backfill-pro-credits] Starting${DRY_RUN ? " (DRY RUN)" : ""}…`);

  // Find every user who has Pro access (hasPro=true) but is missing the
  // pro-context credit balance row.
  const affected = await prisma.user.findMany({
    where: {
      hasPro: true,
      aiCreditBalances: {
        none: { appContext: "pro" },
      },
    },
    select: {
      id: true,
      email: true,
      proPurchasedAt: true,
      currentVersion: true,
    },
  });

  console.log(
    `[backfill-pro-credits] Found ${affected.length} users to backfill.`,
  );

  if (affected.length === 0) {
    console.log("[backfill-pro-credits] Nothing to do.");
    return;
  }

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of affected) {
    try {
      if (DRY_RUN) {
        console.log(
          `  [DRY RUN] Would grant to: ${user.email} (id=${user.id}, version=${user.currentVersion}, proPurchasedAt=${user.proPurchasedAt ?? "null"})`,
        );
        skipped++;
        continue;
      }

      const txnId = `backfill_pro_${user.id}`;

      await grantProCredits(user.id, {
        txnId,
        amountCharged: 0,
        currency: "usd",
        paymentMethod: "backfill",
      });

      console.log(`  ✓ Granted to: ${user.email} (id=${user.id})`);
      success++;
    } catch (err) {
      console.error(
        `  ✗ Failed for: ${user.email} (id=${user.id}): ${err.message}`,
      );
      failed++;
    }
  }

  console.log(
    `[backfill-pro-credits] Done. success=${success} skipped=${skipped} failed=${failed}`,
  );

  if (failed > 0) {
    process.exit(1);
  }
}

run()
  .catch((err) => {
    console.error("[backfill-pro-credits] Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
