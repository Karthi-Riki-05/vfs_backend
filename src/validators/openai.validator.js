const { z } = require('zod');

const proxySchema = z.object({
    body: z.object({
        messages: z.array(z.object({
            role: z.enum(['system', 'user', 'assistant']),
            content: z.string().min(1).max(50000),
        })).min(1, 'Messages array is required'),
        model: z.string().max(100).optional(),
    }),
});

module.exports = { proxySchema };
