const { z } = require('zod');

const createGroupSchema = z.object({
    body: z.object({
        name: z.string().min(1, 'Name is required').max(255).trim(),
    }),
});

const updateGroupSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        name: z.string().min(1).max(255).trim().optional(),
        isPredefined: z.boolean().optional(),
    }),
});

const idParamSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
});

module.exports = { createGroupSchema, updateGroupSchema, idParamSchema };
