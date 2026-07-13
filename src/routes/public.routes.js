const express = require("express");
const router = express.Router();
const publicController = require("../controllers/public.controller");
const validate = require("../middleware/validate");
const {
  contactSchema,
  assistantSchema,
} = require("../validators/public.validator");
const { authLimiter, aiLimiter } = require("../middleware/rateLimiter");

// Unauthenticated flow/shape viewers — reachable only when the owner has
// explicitly set isPublic=true (via flowsApi.publish / shapesApi.update).
// Always view-only; never touches the update/delete paths.
router.get("/flows/:id", publicController.getPublicFlow);
router.get("/shapes/:id", publicController.getPublicShape);

// Unauthenticated endpoint for the marketing site's contact/support forms.
// authLimiter (10 req / 15 min per IP) + reCAPTCHA v3 keep it spam-resistant.
router.post(
  "/contact",
  authLimiter,
  validate(contactSchema),
  publicController.submitContact,
);

// Unauthenticated product-Q&A assistant for the marketing site (Gemini Flash).
// aiLimiter caps abuse; the service also caps history and output tokens.
router.post(
  "/assistant",
  aiLimiter,
  validate(assistantSchema),
  publicController.assistantChat,
);

module.exports = router;
