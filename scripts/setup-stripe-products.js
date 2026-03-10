/**
 * One-time script to create persistent Stripe products and prices.
 *
 * Usage:
 *   node backend/scripts/setup-stripe-products.js
 *
 * It creates:
 *   - 1 Product ("Value Charts Team Plan")
 *   - 1 Monthly Price ($1.00/user/month)
 *   - 1 Yearly  Price ($7.20/user/year)
 *
 * After running, copy the printed IDs into your .env file.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function main() {
    const currency = (process.env.STRIPE_CURRENCY || 'usd').toLowerCase();

    // 1. Create product
    const product = await stripe.products.create({
        name: 'Value Charts Team Plan',
        description: 'Team collaboration for Value Charts — unlimited flows, all shapes, AI diagram generation.',
    });
    console.log(`STRIPE_PRODUCT_ID=${product.id}`);

    // 2. Monthly price: $1.00 per user per month
    const monthlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: 100, // cents
        currency,
        recurring: { interval: 'month' },
        nickname: 'Monthly per-user',
    });
    console.log(`STRIPE_MONTHLY_PRICE_ID=${monthlyPrice.id}`);

    // 3. Yearly price: $7.20 per user per year
    const yearlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: 720, // cents
        currency,
        recurring: { interval: 'year' },
        nickname: 'Yearly per-user',
    });
    console.log(`STRIPE_YEARLY_PRICE_ID=${yearlyPrice.id}`);

    console.log('\nDone! Add the lines above to your .env file.');
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
