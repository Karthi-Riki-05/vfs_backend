const express = require("express");
const router = express.Router();
const aiController = require("../controllers/ai-assistant.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { aiLimiter } = require("../middleware/rateLimiter");
const { docUpload } = require("../middleware/docUpload");
const validate = require("../middleware/validate");
const {
  chatSchema,
  consentSchema,
  historyQuerySchema,
  generateDiagramSchema,
} = require("../validators/ai-assistant.validator");

// All routes require authentication
router.use(authenticate);

// Chat
router.post("/chat", aiLimiter, validate(chatSchema), aiController.chat);

// Diagram generation
router.post(
  "/generate-diagram",
  aiLimiter,
  validate(generateDiagramSchema),
  aiController.generateDiagram,
);
router.post(
  "/generate-diagram-from-document",
  aiLimiter,
  docUpload.single("document"),
  aiController.generateDiagramFromDocument,
);

// User context for AI
router.get("/context", aiController.getContext);

// Consent
router.get("/consent", aiController.getConsent);
router.post("/consent", validate(consentSchema), aiController.setConsent);

// History
router.get("/history", validate(historyQuerySchema), aiController.getHistory);
router.get("/history/:id", aiController.getConversation);

// Persistent conversations (ChatGPT-style)
router.get("/conversations", aiController.listConversations);
router.post("/conversations", aiController.createConversation);
router.get(
  "/conversations/:conversationId/messages",
  aiController.getConversationMessages,
);
router.put(
  "/conversations/:conversationId/title",
  aiController.updateConversationTitle,
);
router.delete(
  "/conversations/:conversationId",
  aiController.deleteConversation,
);

// Document analysis (upload → preview → user instructs)
router.post(
  "/analyze-document",
  aiLimiter,
  docUpload.single("document"),
  aiController.analyzeDocument,
);

// GDPR: Delete all AI data
router.delete("/data", aiController.deleteData);

module.exports = router;
