"use strict";
/**
 * One-time backfill: insert the missing transaction_logs and subscription_history
 * rows for mr5@gmail.com whose original checkout webhook was never processed.
 *
 * Run ONCE inside the backend container:
 *   docker compose exec backend node scripts/backfill-mr5-txn.js
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const USER_ID = "cmqp4engf0000ss4awetk2czr";

async function main() {
  const sub = await prisma.subscription.findUnique({
    where: { userId: USER_ID },
  });
  if (!sub) {
    console.log("No subscription found for mr5 — nothing to backfill.");
    return;
  }

  console.log(
    "Subscription found:",
    sub.paymentId,
    sub.productType,
    sub.usersCount,
    sub.price,
  );

  // Check existing records
  const existingTxn = await prisma.transactionLog.findFirst({
    where: { userId: USER_ID },
  });
  const existingHist = await prisma.subscriptionHistory.findFirst({
    where: { userId: USER_ID },
  });

  // Backfill transaction_log for initial purchase (original 5 seats at $30)
  if (!existingTxn) {
    await prisma.transactionLog.create({
      data: {
        userId: USER_ID,
        chargeId: sub.paymentId,
        txnId: `backfill_initial_${USER_ID}`,
        amountCharged: 3000, // $30.00 in cents — original 5-seat price
        currency: "usd",
        status: "success",
        paymentMethod: "card",
        appType: "enterprise",
        appContext: "team",
        purchaseType: "team_subscription",
      },
    });
    console.log(
      "✅ Created initial transaction_log row ($30 original purchase)",
    );
  } else {
    console.log("⏭  transaction_log already has rows — skipping");
  }

  // Backfill subscription_history for initial purchase
  if (!existingHist) {
    await prisma.subscriptionHistory.create({
      data: {
        userId: USER_ID,
        planName: "Team Monthly",
        productType: "team_monthly",
        status: "active",
        price: 30,
        currency: "usd",
        isRecurring: true,
        source: "stripe",
        startedAt: sub.startedAt || new Date(),
        expiresAt: sub.expiresAt,
        appContext: "team",
        stripePaymentId: sub.paymentId,
        archivedReason: "purchase",
        snapshot: {
          backfilled: true,
          note: "Original 5-seat purchase, webhook was not processed",
        },
      },
    });
    console.log("✅ Created initial subscription_history row");
  } else {
    console.log("⏭  subscription_history already has rows — skipping");
  }

  // Also fix has_pro and current_version on the user (entitlement mismatch)
  const user = await prisma.user.findUnique({
    where: { id: USER_ID },
    select: { hasPro: true, currentVersion: true },
  });
  console.log("User before:", user);
  if (!user.hasPro || user.currentVersion !== "team") {
    await prisma.user.update({
      where: { id: USER_ID },
      data: { hasPro: true, currentVersion: "team", teamUnlimitedFlows: true },
    });
    console.log("✅ Fixed user.hasPro=true, currentVersion=team");
  } else {
    console.log("⏭  User entitlements already correct");
  }

  // Fix app_context on subscription (should be 'team' not 'free')
  if (sub.appContext !== "team") {
    await prisma.subscription.update({
      where: { userId: USER_ID },
      data: { appContext: "team", appType: "enterprise" },
    });
    console.log("✅ Fixed subscription.appContext=team");
  } else {
    console.log("⏭  subscription.appContext already correct");
  }

  console.log("\nDone. Final state:");
  const finalSub = await prisma.subscription.findUnique({
    where: { userId: USER_ID },
  });
  const finalUser = await prisma.user.findUnique({
    where: { id: USER_ID },
    select: { hasPro: true, currentVersion: true },
  });
  const txns = await prisma.transactionLog.findMany({
    where: { userId: USER_ID },
  });
  const hist = await prisma.subscriptionHistory.findMany({
    where: { userId: USER_ID },
  });
  console.log(
    "  subscription:",
    finalSub.status,
    finalSub.appContext,
    finalSub.usersCount,
    "seats",
    "$" + finalSub.price,
  );
  console.log("  user:", finalUser);
  console.log("  transaction_logs:", txns.length, "rows");
  console.log("  subscription_history:", hist.length, "rows");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
