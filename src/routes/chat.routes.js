const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const { authenticate } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate');
const { createChatGroupSchema, sendMessageSchema, markReadSchema, getMessagesQuerySchema, idParamSchema } = require('../validators/chat.validator');

router.use(authenticate);

/**
 * @swagger
 * /api/v1/chat/groups:
 *   get:
 *     summary: List user's chat groups
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of chat groups with last message preview
 */
router.get('/groups', chatController.getChatGroups);

/**
 * @swagger
 * /api/v1/chat/groups:
 *   post:
 *     summary: Create a chat group
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title:
 *                 type: string
 *               flowId:
 *                 type: integer
 *               memberIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Chat group created
 */
router.post('/groups', validate(createChatGroupSchema), chatController.createChatGroup);

/**
 * @swagger
 * /api/v1/chat/groups/{id}/messages:
 *   get:
 *     summary: Get paginated messages for a chat group
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Paginated messages
 *       403:
 *         description: Not a member
 */
router.get('/groups/:id/messages', validate(getMessagesQuerySchema), chatController.getMessages);

/**
 * @swagger
 * /api/v1/chat/groups/{id}/messages:
 *   post:
 *     summary: Send a message to a chat group
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [text, image, audio, video, docs, others]
 *     responses:
 *       201:
 *         description: Message sent
 */
router.post('/groups/:id/messages', validate(sendMessageSchema), chatController.sendMessage);

/**
 * @swagger
 * /api/v1/chat/messages/{id}/read:
 *   put:
 *     summary: Mark a message as read
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message marked as read
 */
/**
 * @swagger
 * /api/v1/chat/groups/{id}/members:
 *   post:
 *     summary: Add a member to a chat group
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Member added
 */
router.post('/groups/:id/members', chatController.addMember);

router.put('/messages/:id/read', validate(markReadSchema), chatController.markRead);

module.exports = router;
