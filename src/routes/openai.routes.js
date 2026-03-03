const express = require('express');
const router = express.Router();
const openaiController = require('../controllers/openai.controller');
const { authenticate } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate');
const { aiLimiter } = require('../middleware/rateLimiter');
const { proxySchema } = require('../validators/openai.validator');

/**
 * @swagger
 * /api/v1/openai:
 *   post:
 *     summary: Proxy request to OpenAI API
 *     tags: [AI]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messages]
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [system, user, assistant]
 *                     content:
 *                       type: string
 *               model:
 *                 type: string
 *                 default: gpt-4
 *     responses:
 *       200:
 *         description: AI response
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/', authenticate, aiLimiter, validate(proxySchema), openaiController.proxy);

module.exports = router;
