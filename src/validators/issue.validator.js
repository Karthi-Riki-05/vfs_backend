const { z } = require('zod');

const createIssueSchema = z.object({
    body: z.object({
        title: z.string().min(1).max(255).trim(),
        flowId: z.number().int(),
        flowItemId: z.string().default(''),
        appType: z.enum(['enterprise', 'individual']).optional(),
    }),
});

const updateIssueSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        title: z.string().min(1).max(255).trim().optional(),
        isChecked: z.boolean().optional(),
    }),
});

const getIssuesQuerySchema = z.object({
    query: z.object({
        flowId: z.string().regex(/^\d+$/).transform(Number).optional(),
        page: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive()).optional(),
        limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100)).optional(),
    }),
});

const idParamSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
});

module.exports = {
    createIssueSchema,
    updateIssueSchema,
    getIssuesQuerySchema,
    idParamSchema,
};
