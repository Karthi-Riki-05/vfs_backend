const express = require("express");
const router = express.Router();
const { getDisplayPricing } = require("../services/pricing.service");

const TZ_COUNTRY_MAP = {
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "Europe/London": "GB",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Madrid": "EU",
  "Europe/Rome": "EU",
  "Asia/Tokyo": "JP",
  "Asia/Singapore": "SG",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
};

function detectCountryFromTimezone(timezone) {
  if (!timezone) return null;
  return TZ_COUNTRY_MAP[timezone] || null;
}

// GET /api/v1/pricing — public endpoint, no auth
router.get("/", async (req, res) => {
  try {
    // CRITICAL: In test/dev mode, always return USD.
    // Stripe test mode only reliably supports USD in many markets (e.g. SEK).
    const isTestMode =
      process.env.STRIPE_MODE === "test" ||
      process.env.NODE_ENV !== "production";

    if (isTestMode) {
      const pricing = getDisplayPricing("US");
      return res.json({
        success: true,
        data: {
          ...pricing,
          detectedCountry: "US",
          detectionMethod: "test_mode_forced_usd",
          isTestMode: true,
          note: "Test mode: USD pricing shown. Production will show local currency.",
        },
      });
    }

    const country =
      req.headers["cf-ipcountry"] ||
      req.headers["x-country-code"] ||
      req.headers["cloudfront-viewer-country"] ||
      detectCountryFromTimezone(req.query.timezone) ||
      "US";

    const detectionMethod = req.headers["cf-ipcountry"]
      ? "cloudflare"
      : req.headers["cloudfront-viewer-country"]
        ? "cloudfront"
        : req.headers["x-country-code"]
          ? "header"
          : req.query.timezone
            ? "timezone_fallback"
            : "default";

    const pricing = getDisplayPricing(String(country).toUpperCase());

    res.json({
      success: true,
      data: {
        ...pricing,
        detectedCountry: country,
        detectionMethod,
        isTestMode: false,
      },
    });
  } catch (err) {
    console.error("[Pricing] Error:", err);
    res.json({
      success: true,
      data: { ...getDisplayPricing("US"), isTestMode: true },
    });
  }
});

module.exports = router;
