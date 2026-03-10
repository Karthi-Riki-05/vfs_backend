const chatService = require('../services/chat.service');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const path = require('path');
const fs = require('fs');

class ChatController {
    getSidebar = asyncHandler(async (req, res) => {
        const appContext = req.user.currentVersion || 'free';
        const data = await chatService.getSidebarData(req.user.id, appContext);
        res.json({ success: true, data });
    });

    getChatGroups = asyncHandler(async (req, res) => {
        const appContext = req.user.currentVersion || 'free';
        const groups = await chatService.getChatGroups(req.user.id, appContext);
        res.json({ success: true, data: groups });
    });

    createChatGroup = asyncHandler(async (req, res) => {
        const appContext = req.user.currentVersion || 'free';
        const group = await chatService.createChatGroup(req.user.id, req.body, appContext);
        res.status(201).json({ success: true, data: group });
    });

    getMessages = asyncHandler(async (req, res) => {
        const result = await chatService.getMessages(req.params.id, req.user.id, req.query);
        res.json({ success: true, data: result });
    });

    sendMessage = asyncHandler(async (req, res) => {
        const message = await chatService.sendMessage(req.params.id, req.user.id, req.body);
        res.status(201).json({ success: true, data: message });
    });

    markRead = asyncHandler(async (req, res) => {
        await chatService.markMessageRead(req.params.id, req.user.id);
        res.json({ success: true, data: { message: 'Message marked as read' } });
    });

    markGroupRead = asyncHandler(async (req, res) => {
        await chatService.markGroupRead(req.params.id, req.user.id);
        res.json({ success: true, data: { message: 'All messages marked as read' } });
    });

    addMember = asyncHandler(async (req, res) => {
        const member = await chatService.addMember(req.params.id, req.user.id, req.body.userId);
        res.status(201).json({ success: true, data: member });
    });

    uploadFile = asyncHandler(async (req, res) => {
        if (!req.file) {
            throw new AppError('No file uploaded', 400, 'NO_FILE');
        }

        const fileUrl = `/uploads/chat/${req.file.filename}`;
        const groupId = req.body.groupId;

        // If groupId is provided, create a full file message
        if (groupId) {
            const message = await chatService.createFileMessage(groupId, req.user.id, {
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                url: fileUrl,
            });
            return res.json({ success: true, data: message });
        }

        // Otherwise return file info for the client to send as a message
        const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(req.file.originalname);
        res.json({
            success: true,
            data: {
                url: fileUrl,
                filename: req.file.originalname,
                type: isImage ? 'image' : 'docs',
                size: req.file.size,
                mimetype: req.file.mimetype,
            },
        });
    });

    downloadFile = asyncHandler(async (req, res) => {
        const file = await chatService.getFile(req.params.id, req.user.id);
        const filePath = path.join(__dirname, '../../uploads/chat', path.basename(file.filePath));

        if (!fs.existsSync(filePath)) {
            throw new AppError('File not found on disk', 404, 'FILE_NOT_FOUND');
        }

        res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
        res.setHeader('Content-Type', file.fileType);
        fs.createReadStream(filePath).pipe(res);
    });

    previewFile = asyncHandler(async (req, res) => {
        const file = await chatService.getFile(req.params.id, req.user.id);
        res.json({
            success: true,
            data: {
                id: file.id,
                fileName: file.fileName,
                fileType: file.fileType,
                fileSize: file.fileSize,
                filePath: file.filePath,
                createdAt: file.createdAt,
            },
        });
    });

    getUnreadCounts = asyncHandler(async (req, res) => {
        const counts = await chatService.getUnreadCounts(req.user.id);
        res.json({ success: true, data: counts });
    });

    getGroupInfo = asyncHandler(async (req, res) => {
        const info = await chatService.getGroupInfo(req.params.id, req.user.id);
        res.json({ success: true, data: info });
    });

    updateGroup = asyncHandler(async (req, res) => {
        const group = await chatService.updateGroup(req.params.id, req.user.id, req.body);
        res.json({ success: true, data: group });
    });

    getAvailableMembers = asyncHandler(async (req, res) => {
        const appContext = req.user.currentVersion || 'free';
        const members = await chatService.getAvailableMembers(req.params.id, req.user.id, appContext);
        res.json({ success: true, data: members });
    });

    addMembers = asyncHandler(async (req, res) => {
        const appContext = req.user.currentVersion || 'free';
        const result = await chatService.addMembers(req.params.id, req.user.id, req.body.userIds, appContext);
        res.json({ success: true, data: result });
    });

    removeMember = asyncHandler(async (req, res) => {
        await chatService.removeMember(req.params.id, req.user.id, req.params.userId);
        res.json({ success: true, data: { message: 'Member removed' } });
    });

    leaveGroup = asyncHandler(async (req, res) => {
        await chatService.leaveGroup(req.params.id, req.user.id);
        res.json({ success: true, data: { message: 'Left the group' } });
    });

    deleteGroup = asyncHandler(async (req, res) => {
        await chatService.deleteGroup(req.params.id, req.user.id);
        res.json({ success: true, data: { message: 'Group deleted' } });
    });
}

module.exports = new ChatController();
