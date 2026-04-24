/**
 * One-time script to create INR Stripe products and prices in TEST mode.
 *
 * Usage (inside backend container):
 *   docker compose exec backend node scripts/setup-stripe-products-inr.js
 *
 * Stripe TEST mode uses STRIPE_SECRET_KEY (sk_test_...). This script
 * hardcodes currency: 'inr' per price — it does NOT rely on
 * STRIPE_CURRENCY, so the global env default can stay 'usd' while
 * these new products remain INR.
 *
 * Creates 7 products + prices:
 *   1. ValueChart Pro Monthly       — Rs. 499/month        (recurring)
 *   2. ValueChart Pro Yearly        — Rs. 4,999/year       (recurring)
 *   3. ValueChart Team Monthly      — Rs. 999/user/month   (recurring)
 *   4. ValueChart Team Yearly       — Rs. 9,999/user/year  (recurring)
 *   5. AI Addon Starter   (25 credits)  — Rs. 149          (one-time)
 *   6. AI Addon Standard  (60 credits)  — Rs. 299          (one-time)
 *   7. AI Addon Pro Pack  (150 credits) — Rs. 649          (one-time)
 *
 * After the script finishes, it prints the env lines to paste into .env.
 */

require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

if (!process.env.STRIPE_SECRET_KEY) {
  console.error("ERROR: STRIPE_SECRET_KEY missing from .env");
  process.exit(1);
}
if (process.env.STRIPE_MODE === "live") {
  console.error(
    "ERROR: STRIPE_MODE=live detected. This script must run in TEST mode only.",
  );
  console.error("Set STRIPE_MODE=test in .env and retry.");
  process.exit(1);
}

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const PRODUCTS = [
  {
    envKey: "STRIPE_PRO_MONTHLY_PRICE_INR",
    productName: "ValueChart Pro - Monthly",
    productDesc: "ValueChart Pro — monthly subscription, 100 AI credits/month.",
    price: 49900,
    recurring: { interval: "month" },
    metadata: { plan: "pro", platform: "valuechart", type: "monthly" },
    nickname: "Pro Monthly INR",
  },
  {
    envKey: "STRIPE_PRO_YEARLY_PRICE_INR",
    productName: "ValueChart Pro - Yearly",
    productDesc: "ValueChart Pro — yearly subscription, 100 AI credits/month.",
    price: 499900,
    recurring: { interval: "year" },
    metadata: { plan: "pro", platform: "valuechart", type: "yearly" },
    nickname: "Pro Yearly INR",
  },
  {
    envKey: "STRIPE_TEAM_MONTHLY_PRICE_INR",
    productName: "ValueChart Team - Monthly per seat",
    productDesc:
      "ValueChart Team — monthly per-seat subscription, 300 AI credits/month.",
    price: 99900,
    recurring: { interval: "month" },
    metadata: { plan: "team", platform: "valuechart", type: "monthly" },
    nickname: "Team Monthly INR (per seat)",
  },
  {
    envKey: "STRIPE_TEAM_YEARLY_PRICE_INR",
    productName: "ValueChart Team - Yearly per seat",
    productDesc:
      "ValueChart Team — yearly per-seat subscription, 300 AI credits/month.",
    price: 999900,
    recurring: { interval: "year" },
    metadata: { plan: "team", platform: "valuechart", type: "yearly" },
    nickname: "Team Yearly INR (per seat)",
  },
  {
    envKey: "STRIPE_AI_ADDON_STARTER_PRICE",
    productName: "AI Addon - Starter (25 credits)",
    productDesc:
      "One-time purchase of 25 AI diagram credits. Credits never expire.",
    price: 14900,
    recurring: null,
    metadata: { type: "ai_addon", credits: "25" },
    nickname: "AI Addon Starter",
  },
  {
    envKey: "STRIPE_AI_ADDON_STANDARD_PRICE",
    productName: "AI Addon - Standard (60 credits)",
    productDesc:
      "One-time purchase of 60 AI diagram credits. Credits never expire.",
    price: 29900,
    recurring: null,
    metadata: { type: "ai_addon", credits: "60" },
    nickname: "AI Addon Standard",
  },
  {
    envKey: "STRIPE_AI_ADDON_PROPPACK_PRICE",
    productName: "AI Addon - Pro Pack (150 credits)",
    productDesc:
      "One-time purchase of 150 AI diagram credits. Credits never expire.",
    price: 64900,
    recurring: null,
    metadata: { type: "ai_addon", credits: "150" },
    nickname: "AI Addon Pro Pack",
  },
];

async function createProductAndPrice(spec) {
  const product = await stripe.products.create({
    name: spec.productName,
    description: spec.productDesc,
    metadata: spec.metadata,
  });

  const priceArgs = {
    product: product.id,
    unit_amount: spec.price,
    currency: "inr",
    nickname: spec.nickname,
    metadata: spec.metadata,
  };
  if (spec.recurring) priceArgs.recurring = spec.recurring;

  const price = await stripe.prices.create(priceArgs);
  return { productId: product.id, priceId: price.id };
}

async function main() {
  console.log("Creating INR Stripe products in TEST mode...\n");
  const results = [];

  for (const spec of PRODUCTS) {
    try {
      const { productId, priceId } = await createProductAndPrice(spec);
      console.log(`${spec.envKey}=${priceId}`);
      console.log(`  (product: ${productId}, name: "${spec.productName}")`);
      results.push({ envKey: spec.envKey, priceId });
    } catch (err) {
      console.error(`FAILED: ${spec.productName}: ${err.message}`);
      throw err;
    }
  }

  console.log("\n=== Add these lines to your .env file ===\n");
  for (const r of results) console.log(`${r.envKey}=${r.priceId}`);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
