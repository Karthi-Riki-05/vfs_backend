const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai-assistant.controller');
const { authenticate } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate');
const { chatSchema, consentSchema, historyQuerySchema } = require('../validators/ai-assistant.validator');

// All routes require authentication
router.use(authenticate);

// Chat
router.post('/chat', validate(chatSchema), aiController.chat);

// User context for AI
router.get('/context', aiController.getContext);

// Consent
router.get('/consent', aiController.getConsent);
router.post('/consent', validate(consentSchema), aiController.setConsent);

// History
router.get('/history', validate(historyQuerySchema), aiController.getHistory);
router.get('/history/:id', aiController.getConversation);

// GDPR: Delete all AI data
router.delete('/data', aiController.deleteData);

module.exports = router;
