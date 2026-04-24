/**
 * Display pricing service.
 * Stripe always charges in USD; this service returns a local-currency
 * approximation for UI display only. Adaptive Pricing at checkout will
 * do the authoritative conversion.
 */

const DISPLAY_RATES = {
  IN: { currency: "INR", symbol: "Rs. ", rate: 83 },
  US: { currency: "USD", symbol: "$", rate: 1 },
  GB: { currency: "GBP", symbol: "£", rate: 0.79 },
  EU: { currency: "EUR", symbol: "€", rate: 0.92 },
  DE: { currency: "EUR", symbol: "€", rate: 0.92 },
  FR: { currency: "EUR", symbol: "€", rate: 0.92 },
  JP: { currency: "JPY", symbol: "¥", rate: 150 },
  SG: { currency: "SGD", symbol: "S$", rate: 1.35 },
  AU: { currency: "AUD", symbol: "A$", rate: 1.52 },
  CA: { currency: "CAD", symbol: "C$", rate: 1.36 },
  DEFAULT: { currency: "USD", symbol: "$", rate: 1 },
};

const BASE_PRICES_USD = {
  pro_monthly: 599,
  pro_yearly: 4999,
  team_monthly: 999,
  team_yearly: 7999,
  addon_starter: 199,
  addon_standard: 399,
  addon_proppack: 799,
};

function formatAmount(amount, currency) {
  if (currency === "JPY") return Math.round(amount).toString();
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2);
}

function getDisplayPricing(countryCode = "US") {
  const code = (countryCode || "US").toUpperCase();
  const locale = DISPLAY_RATES[code] || DISPLAY_RATES.DEFAULT;
  const prices = {};

  for (const [key, usdCents] of Object.entries(BASE_PRICES_USD)) {
    const usd = usdCents / 100;
    const localAmount = usd * locale.rate;
    const formatted = formatAmount(localAmount, locale.currency);
    prices[key] = {
      display: `${locale.symbol}${formatted}`,
      amount: Number(formatted),
      currency: locale.currency,
      usdCents,
    };
  }

  return {
    countryCode: code,
    currency: locale.currency,
    symbol: locale.symbol,
    prices,
    note: "Actual charge may vary slightly based on Stripe conversion rate",
  };
}

module.exports = { getDisplayPricing, BASE_PRICES_USD, DISPLAY_RATES };
