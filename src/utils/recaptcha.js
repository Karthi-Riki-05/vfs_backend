const logger = require("./logger");

/**
 * Verifies a Google reCAPTCHA v3 token.
 * Skips (returns true) when RECAPTCHA_SECRET is not configured or in tests,
 * so local/dev environments keep working without keys.
 */
async function verifyRecaptcha(token, remoteIp) {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret || process.env.NODE_ENV === "test") return true;
  if (!token) return false;

  try {
    const params = new URLSearchParams({ secret, response: token });
    if (remoteIp) params.append("remoteip", remoteIp);
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = await res.json();
    // v3 returns a score 0..1 — 0.5 is Google's recommended default threshold
    const minScore = Number(process.env.RECAPTCHA_MIN_SCORE) || 0.5;
    if (!data.success) {
      logger.warn(
        `[recaptcha] verification failed: ${JSON.stringify(data["error-codes"] || [])}`,
      );
      return false;
    }
    if (typeof data.score === "number" && data.score < minScore) {
      logger.warn(`[recaptcha] low score ${data.score} (min ${minScore})`);
      return false;
    }
    return true;
  } catch (err) {
    // Fail open on network errors — rate limiting still protects the endpoint
    logger.error(`[recaptcha] verify error: ${err.message}`);
    return true;
  }
}

module.exports = { verifyRecaptcha };
