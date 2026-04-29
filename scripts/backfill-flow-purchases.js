// Walks recent Stripe checkout sessions for purchaseType='pro_extra_flows',
// payment_status='paid', and credits any that aren't recorded in the DB.
// Use to recover from missed webhooks (local dev without `stripe listen`,
// failed delivery, etc.). Idempotent — handleExtraFlowsWebhook dedupes
// on stripePaymentIntentId.

const { getStripe } = require("../src/lib/stripe");
const proService = require("../src/services/pro.service");
const { prisma } = require("../src/lib/prisma");

(async () => {
  const stripe = getStripe();
  const sessions = await stripe.checkout.sessions.list({ limit: 100 });
  let processed = 0;
  let skipped = 0;
  for (const s of sessions.data) {
    if (s.payment_status !== "paid") continue;
    if (s.metadata?.purchaseType !== "pro_extra_flows") continue;

    const paymentIntentId = s.payment_intent || s.id;
    const existing = await prisma.proFlowPurchase.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (existing) {
      skipped++;
      continue;
    }
    console.log(
      `[backfill] crediting session=${s.id} user=${s.metadata?.userId} pkg=${s.metadata?.flowPackage}`,
    );
    await proService.handleExtraFlowsWebhook(s);
    processed++;
  }
  console.log(
    `[backfill] done — credited=${processed} skipped(already)=${skipped} scanned=${sessions.data.length}`,
  );
  await prisma.$disconnect();
  process.exit(0);
})().catch((err) => {
  console.error("[backfill] fatal:", err);
  process.exit(1);
});
