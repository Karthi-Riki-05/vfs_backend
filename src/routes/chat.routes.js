const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const chatController = require('../controllers/chat.controller');
const { authenticate } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate');
const {
    createChatGroupSchema,
    sendMessageSchema,
    markReadSchema,
    getMessagesQuerySchema,
    idParamSchema,
    markGroupReadSchema,
    ALLOWED_FILE_TYPES,
    MAX_FILE_SIZE,
} = require('../validators/chat.validator');

// File upload configuration — 25MB limit with file type validation
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads/chat')),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const fileFilter = (req, file, cb) => {
    if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`File type ${file.mimetype} is not allowed`), false);
    }
};

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter,
});

router.use(authenticate);

/**
 * @swagger
 * /api/v1/chat/groups:
 *   get:
 *     summary: List user's chat groups with unread counts
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of chat groups with last message preview and unread count
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
 */
router.post('/groups', validate(createChatGroupSchema), chatController.createChatGroup);

/**
 * @swagger
 * /api/v1/chat/groups/{id}/messages:
 *   get:
 *     summary: Get paginated messages for a chat group (supports ?after= for sync)
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
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
 */
router.post('/groups/:id/messages', validate(sendMessageSchema), chatController.sendMessage);

/**
 * @swagger
 * /api/v1/chat/groups/{id}/read:
 *   put:
 *     summary: Mark all messages in a group as read
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 */
router.put('/groups/:id/read', validate(markGroupReadSchema), chatController.markGroupRead);

/**
 * @swagger
 * /api/v1/chat/groups/{id}/members:
 *   post:
 *     summary: Add a member to a chat group
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 */
router.post('/groups/:id/members', chatController.addMember);

/**
 * @swagger
 * /api/v1/chat/messages/{id}/read:
 *   put:
 *     summary: Mark a single message as read
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 */
router.put('/messages/:id/read', validate(markReadSchema), chatController.markRead);

/**
 * @swagger
 * /api/v1/chat/unread-count:
 *   get:
 *     summary: Get total and per-group unread message counts
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 */
router.get('/unread-count', chatController.getUnreadCounts);

/**
 * @swagger
 * /api/v1/chat/upload:
 *   post:
 *     summary: Upload a file (25MB max, with optional groupId for auto-message creation)
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 */
router.post('/upload', upload.single('file'), chatController.uploadFile);

/**
 * @swagger
 * /api/v1/chat/files/{id}:
 *   get:
 *     summary: Download a chat file (verifies membership)
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 */
router.get('/files/:id', chatController.downloadFile);

/**
 * @swagger
 * /api/v1/chat/files/{id}/preview:
 *   get:
 *     summary: Get file metadata/preview info
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 */
router.get('/files/:id/preview', chatController.previewFile);

module.exports = router;
