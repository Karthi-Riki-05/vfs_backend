#!/usr/bin/env node
// Backfills flowAddonCurrentPeriodEnd for users who paid via saved card
// (the direct-charge path that previously didn't save this field).
// Fetches current_period_end from Stripe and writes it to the DB.
// Safe to run multiple times — skips users who already have the value set.

const { prisma } = require("../src/lib/prisma");
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

async function run() {
  console.log("=== backfill-addon-period-end ===\n");

  const affected = await prisma.user.findMany({
    where: {
      flowAddonStatus: { in: ["active", "cancelling"] },
      flowAddonCurrentPeriodEnd: null,
      flowAddonStripeSubId: { not: null },
    },
    select: { id: true, email: true, flowAddonStripeSubId: true },
  });

  if (affected.length === 0) {
    console.log("No affected users. Nothing to do.");
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${affected.length} user(s) to backfill:\n`);

  let fixed = 0;
  let failed = 0;

  for (const user of affected) {
    try {
      const sub = await stripe.subscriptions.retrieve(
        user.flowAddonStripeSubId,
      );
      const periodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : null;

      if (!periodEnd) {
        console.log(
          `  SKIP ${user.email} — Stripe returned no current_period_end`,
        );
        failed++;
        continue;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { flowAddonCurrentPeriodEnd: periodEnd },
      });

      console.log(
        `  FIXED ${user.email} → period ends ${periodEnd.toISOString()}`,
      );
      fixed++;
    } catch (err) {
      console.log(`  ERROR ${user.email}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Fixed:  ${fixed}`);
  console.log(`Failed: ${failed}`);

  await prisma.$disconnect();
}

run().catch((err) => {
  console.error("Error:", err.message);
  prisma.$disconnect();
  process.exit(1);
});
