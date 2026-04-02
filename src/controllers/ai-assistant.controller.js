const asyncHandler = require('../utils/asyncHandler');
const aiAssistantService = require('../services/ai-assistant.service');

exports.chat = asyncHandler(async (req, res) => {
    const { message, conversationId, userContext } = req.body;
    const result = await aiAssistantService.chat(
        req.user.id,
        message,
        conversationId,
        req.user.currentVersion || 'free',
        userContext
    );
    res.json({ success: true, data: result });
});

exports.getContext = asyncHandler(async (req, res) => {
    const result = await aiAssistantService.getUserContext(req.user.id, req.user.currentVersion || 'free');
    res.json({ success: true, data: result });
});

exports.getConsent = asyncHandler(async (req, res) => {
    const result = await aiAssistantService.getConsent(req.user.id);
    res.json({ success: true, data: result });
});

exports.setConsent = asyncHandler(async (req, res) => {
    const { consented } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    await aiAssistantService.setConsent(req.user.id, consented, ipAddress);
    res.json({ success: true, data: { consented } });
});

exports.getHistory = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const result = await aiAssistantService.getHistory(req.user.id, page, limit);
    res.json({ success: true, data: result });
});

exports.getConversation = asyncHandler(async (req, res) => {
    const result = await aiAssistantService.getConversation(req.user.id, req.params.id);
    res.json({ success: true, data: result });
});

exports.deleteData = asyncHandler(async (req, res) => {
    await aiAssistantService.deleteAllData(req.user.id);
    res.json({ success: true, data: { message: 'All AI data deleted.' } });
});

exports.generateDiagram = asyncHandler(async (req, res) => {
    const { message, existingXml, conversationId } = req.body;
    const result = await aiAssistantService.generateDiagramFromText(
        req.user.id,
        message,
        existingXml || null,
        conversationId || null,
        req.user.currentVersion || 'free'
    );
    res.json({ success: true, data: result });
});

exports.generateDiagramFromDocument = asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file uploaded' } });
    }

    const fileName = req.file.originalname;
    const mimeType = req.file.mimetype;
    let documentText = '';

    if (mimeType === 'application/pdf') {
        try {
            const pdfParse = require('pdf-parse');
            const pdfData = await pdfParse(req.file.buffer);
            documentText = pdfData.text;
        } catch (e) {
            return res.status(400).json({ success: false, error: { code: 'PARSE_ERROR', message: 'Could not extract PDF text' } });
        }
    } else if (fileName.endsWith('.docx')) {
        try {
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ buffer: req.file.buffer });
            documentText = result.value;
        } catch (e) {
            return res.status(400).json({ success: false, error: { code: 'PARSE_ERROR', message: 'Could not extract DOCX text' } });
        }
    } else {
        documentText = req.file.buffer.toString('utf-8');
    }

    if (!documentText.trim()) {
        return res.status(400).json({ success: false, error: { code: 'EMPTY_DOC', message: 'Could not extract text from document' } });
    }

    const result = await aiAssistantService.generateDiagramFromDocument(req.user.id, documentText, fileName);
    res.json({ success: true, data: result });
});
