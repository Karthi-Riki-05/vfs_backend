const router = require("express").Router();
const c = require("../controllers/licenseProbe.controller");
const { biometricLimiter } = require("../middleware/rateLimiter");

/**
 * LICENSE PROBE — diagnostic harness, not product surface.
 *
 * Measures whether Play Integrity's `appLicensingVerdict` flips to UNLICENSED
 * after an upfront paid app is refunded. Full rationale, the experiment
 * protocol, and the reasons this route is unauthenticated and env-gated are in
 * controllers/licenseProbe.controller.js.
 *
 * Reusing `biometricLimiter` rather than adding a limiter: it is the existing
 * limiter for open, token-bearing, native-shell endpoints, which is exactly
 * this shape. A probe is a handful of calls a day by design — anything hitting
 * a rate limit here is abuse, not use.
 *
 * ⚠️ REMOVE this route, its controller, playIntegrity.service.js, the
 * LicenseProbe model and the Kotlin channel once the question is answered.
 */
router.post("/probe", biometricLimiter, c.probe);
router.get("/probe/timeline", biometricLimiter, c.timeline);

module.exports = router;
