/**
 * Stripe product setup for ValueChart v3 pricing.
 *
 * Products created:
 *   Team Monthly  — $2.00/user/month  (per-seat, qty = seat count)
 *   Team Yearly   — $20.00/user/year  (per-seat, qty = seat count)
 *   Pro Base      — $5.00 one-time    (lifetime access + 200 AI cr/mo)
 *   Flow Standard — $10.00/month      (100 flows, recurring)
 *   Flow Unlimited— $20.00/month      (unlimited flows, recurring)
 *   AI Top-up 50  — $5.00 one-time    (50 addon credits)
 *   AI Top-up 100 — $8.00 one-time    (100 addon credits)
 *   AI Top-up 200 — $15.00 one-time   (200 addon credits)
 *
 * Usage:
 *   docker compose exec backend node scripts/setup-stripe-products-v3.js
 *
 * After running, copy the printed env vars into your .env file and
 * restart the backend container.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

async function setup() {
  console.log("Setting up Stripe products — v3 pricing (USD base)...");
  console.log("Mode:", process.env.STRIPE_MODE || "test");

  // ── Team subscription (per-seat) ─────────────────────────────────────────
  const teamProduct = await stripe.products.create({
    name: "ValueChart Team",
    description: "Team workspace — 60 AI credits/user/month, unlimited flows",
    metadata: { platform: "valuechart", plan: "team", version: "v3" },
  });

  const teamMonthlyPrice = await stripe.prices.create({
    product: teamProduct.id,
    unit_amount: 200, // $2.00/user
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { plan: "team", type: "monthly", vc_canonical_monthly_200: "1" },
  });

  const teamYearlyPrice = await stripe.prices.create({
    product: teamProduct.id,
    unit_amount: 2000, // $20.00/user
    currency: "usd",
    recurring: { interval: "year" },
    metadata: { plan: "team", type: "yearly", vc_canonical_yearly_2000: "1" },
  });

  // ── Pro Base (one-time) ───────────────────────────────────────────────────
  const proProduct = await stripe.products.create({
    name: "ValueChart Pro",
    description: "Pro lifetime access — 200 AI credits/month + 10 flows",
    metadata: { platform: "valuechart", plan: "pro", version: "v3" },
  });

  const proBasePrice = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 500, // $5.00 one-time
    currency: "usd",
    metadata: { plan: "pro", type: "one_time" },
  });

  // ── Flow Add-ons (recurring monthly) ─────────────────────────────────────
  const flowProduct = await stripe.products.create({
    name: "ValueChart Flow Add-on",
    description: "Monthly flow pack subscription for Pro users",
    metadata: { platform: "valuechart", plan: "flow_addon", version: "v3" },
  });

  const flowStandardPrice = await stripe.prices.create({
    product: flowProduct.id,
    unit_amount: 1000, // $10.00/month
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { plan: "flow_addon", type: "standard", flows: "100" },
  });

  const flowUnlimitedPrice = await stripe.prices.create({
    product: flowProduct.id,
    unit_amount: 2000, // $20.00/month
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { plan: "flow_addon", type: "unlimited" },
  });

  // ── AI Credit Top-ups (one-time) ──────────────────────────────────────────
  const aiProduct = await stripe.products.create({
    name: "ValueChart AI Credits",
    description: "Top-up AI diagram generation credits (never expire)",
    metadata: { platform: "valuechart", plan: "ai_addon", version: "v3" },
  });

  const aiTopup50 = await stripe.prices.create({
    product: aiProduct.id,
    unit_amount: 500, // $5.00
    currency: "usd",
    metadata: { type: "ai_addon", credits: "50", pack: "starter" },
  });

  const aiTopup100 = await stripe.prices.create({
    product: aiProduct.id,
    unit_amount: 800, // $8.00
    currency: "usd",
    metadata: { type: "ai_addon", credits: "100", pack: "standard" },
  });

  const aiTopup200 = await stripe.prices.create({
    product: aiProduct.id,
    unit_amount: 1500, // $15.00
    currency: "usd",
    metadata: { type: "ai_addon", credits: "200", pack: "proppack" },
  });

  console.log("\n✅ Products and prices created. Add to your .env:\n");
  console.log(`STRIPE_TEAM_MONTHLY_PRICE=${teamMonthlyPrice.id}`);
  console.log(`STRIPE_TEAM_YEARLY_PRICE=${teamYearlyPrice.id}`);
  console.log(`STRIPE_PRO_BASE_PRICE=${proBasePrice.id}`);
  console.log(`STRIPE_FLOW_STANDARD_PRICE=${flowStandardPrice.id}`);
  console.log(`STRIPE_FLOW_UNLIMITED_PRICE=${flowUnlimitedPrice.id}`);
  console.log(`STRIPE_AI_ADDON_STARTER_PRICE=${aiTopup50.id}`);
  console.log(`STRIPE_AI_ADDON_STANDARD_PRICE=${aiTopup100.id}`);
  console.log(`STRIPE_AI_ADDON_PROPPACK_PRICE=${aiTopup200.id}`);
  console.log("\nThen restart the backend: docker compose restart backend\n");
}

setup().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
