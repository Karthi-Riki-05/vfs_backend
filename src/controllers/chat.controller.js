const chatService = require('../services/chat.service');
const asyncHandler = require('../utils/asyncHandler');

class ChatController {
    getChatGroups = asyncHandler(async (req, res) => {
        const groups = await chatService.getChatGroups(req.user.id);
        res.json({ success: true, data: groups });
    });

    createChatGroup = asyncHandler(async (req, res) => {
        const group = await chatService.createChatGroup(req.user.id, req.body);
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

    addMember = asyncHandler(async (req, res) => {
        const member = await chatService.addMember(req.params.id, req.user.id, req.body.userId);
        res.status(201).json({ success: true, data: member });
    });
}

module.exports = new ChatController();
