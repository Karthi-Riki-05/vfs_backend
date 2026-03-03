const { z } = require('zod');

const createShapeSchema = z.object({
    body: z.object({
        name: z.string().min(1, 'Name is required').max(255).trim(),
        type: z.enum(['stencil', 'image', 'html', 'shape']).optional(),
        content: z.string().max(500000).optional(),
        textAlignment: z.enum(['top', 'center', 'bottom']).optional(),
        groupId: z.string().optional().nullable(),
        category: z.string().max(100).optional().nullable(),
        xmlContent: z.string().max(500000).optional().nullable(),
        thumbnail: z.string().max(500000).optional().nullable(),
        isPublic: z.boolean().optional(),
    }),
});

const updateShapeSchema = z.object({
    params: z.object({
        id: z.string().min(1),
    }),
    body: z.object({
        name: z.string().min(1).max(255).trim().optional(),
        type: z.enum(['stencil', 'image', 'html', 'shape']).optional(),
        content: z.string().max(500000).optional(),
        textAlignment: z.enum(['top', 'center', 'bottom']).optional(),
        groupId: z.string().optional().nullable(),
        category: z.string().max(100).optional().nullable(),
        xmlContent: z.string().max(500000).optional().nullable(),
        thumbnail: z.string().max(500000).optional().nullable(),
        isPublic: z.boolean().optional(),
    }),
});

const idParamSchema = z.object({
    params: z.object({
        id: z.string().min(1),
    }),
});

module.exports = { createShapeSchema, updateShapeSchema, idParamSchema };
