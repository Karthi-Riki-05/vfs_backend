const { z } = require('zod');

const chatSchema = z.object({
    body: z.object({
        message: z.string().min(1, 'Message is required').max(4000, 'Message too long'),
        conversationId: z.string().optional(),
        userContext: z.any().optional(),
    }),
});

const consentSchema = z.object({
    body: z.object({
        consented: z.boolean(),
    }),
});

const historyQuerySchema = z.object({
    query: z.object({
        page: z.coerce.number().int().min(1).default(1).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20).optional(),
    }),
});

const generateDiagramSchema = z.object({
    body: z.object({
        message: z.string().min(1, 'Message is required').max(4000, 'Message too long'),
        existingXml: z.string().optional().nullable(),
        conversationId: z.string().optional().nullable(),
    }),
});

module.exports = { chatSchema, consentSchema, historyQuerySchema, generateDiagramSchema };
