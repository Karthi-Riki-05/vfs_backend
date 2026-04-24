/**
 * Sets up Stripe products and prices in USD.
 * Stripe Adaptive Pricing converts to user's local currency at checkout.
 *
 * Usage:
 *   docker compose exec backend node scripts/setup-stripe-products-v2.js
 *
 * After running, copy the printed price IDs into your .env file.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

async function setupProducts() {
  console.log("Setting up Stripe products (USD base, Adaptive Pricing)...");
  console.log("Mode:", process.env.STRIPE_MODE || "test");

  // 1. ValueChart Pro (subscription)
  const proProduct = await stripe.products.create({
    name: "ValueChart Pro",
    description:
      "Full access to ValueChart Pro features + 100 AI credits/month",
    metadata: { platform: "valuechart", plan: "pro" },
  });

  const proMonthlyPrice = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 599,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { plan: "pro", type: "monthly" },
  });

  const proYearlyPrice = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 4999,
    currency: "usd",
    recurring: { interval: "year" },
    metadata: { plan: "pro", type: "yearly" },
  });

  // 2. ValueChart Team (subscription per seat)
  const teamProduct = await stripe.products.create({
    name: "ValueChart Team",
    description:
      "Team collaboration with unlimited flows + 300 AI credits/month",
    metadata: { platform: "valuechart", plan: "team" },
  });

  const teamMonthlyPrice = await stripe.prices.create({
    product: teamProduct.id,
    unit_amount: 999,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { plan: "team", type: "monthly" },
  });

  const teamYearlyPrice = await stripe.prices.create({
    product: teamProduct.id,
    unit_amount: 7999,
    currency: "usd",
    recurring: { interval: "year" },
    metadata: { plan: "team", type: "yearly" },
  });

  // 3. AI Credit Addons (one-time)
  const addonProduct = await stripe.products.create({
    name: "ValueChart AI Credits",
    description: "Additional AI diagram generation credits",
    metadata: { platform: "valuechart", plan: "ai_addon" },
  });

  const addonStarterPrice = await stripe.prices.create({
    product: addonProduct.id,
    unit_amount: 199,
    currency: "usd",
    metadata: { type: "ai_addon", credits: "25" },
  });

  const addonStandardPrice = await stripe.prices.create({
    product: addonProduct.id,
    unit_amount: 399,
    currency: "usd",
    metadata: { type: "ai_addon", credits: "60" },
  });

  const addonProPrice = await stripe.prices.create({
    product: addonProduct.id,
    unit_amount: 799,
    currency: "usd",
    metadata: { type: "ai_addon", credits: "150" },
  });

  console.log("\nProducts and prices created successfully.\n");
  console.log("Add these to your .env file:\n");
  console.log(`STRIPE_PRO_MONTHLY_PRICE=${proMonthlyPrice.id}`);
  console.log(`STRIPE_PRO_YEARLY_PRICE=${proYearlyPrice.id}`);
  console.log(`STRIPE_TEAM_MONTHLY_PRICE=${teamMonthlyPrice.id}`);
  console.log(`STRIPE_TEAM_YEARLY_PRICE=${teamYearlyPrice.id}`);
  console.log(`STRIPE_AI_ADDON_STARTER_PRICE=${addonStarterPrice.id}`);
  console.log(`STRIPE_AI_ADDON_STANDARD_PRICE=${addonStandardPrice.id}`);
  console.log(`STRIPE_AI_ADDON_PROPPACK_PRICE=${addonProPrice.id}`);
}

setupProducts().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
