const { z } = require('zod');

const createChatGroupSchema = z.object({
    body: z.object({
        title: z.string().min(1).max(255).trim(),
        flowId: z.number().int().optional(),
        flowItemId: z.string().optional(),
        appType: z.enum(['enterprise', 'individual']).optional(),
        memberIds: z.array(z.string().min(1)).optional(),
    }),
});

const sendMessageSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        message: z.string().min(1).max(10000),
        type: z.enum(['text', 'image', 'audio', 'video', 'docs', 'others']).default('text'),
        attachPath: z.string().max(500).optional(),
    }),
});

const markReadSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
});

const getMessagesQuerySchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    query: z.object({
        page: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive()).optional(),
        limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100)).optional(),
    }),
});

const idParamSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
});

module.exports = {
    createChatGroupSchema,
    sendMessageSchema,
    markReadSchema,
    getMessagesQuerySchema,
    idParamSchema,
};
