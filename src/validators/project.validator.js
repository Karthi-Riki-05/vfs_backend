const { z } = require('zod');

const createProjectSchema = z.object({
    body: z.object({
        name: z.string().min(1, 'Name is required').max(255).trim(),
        description: z.string().max(2000).optional(),
    }),
});

const updateProjectSchema = z.object({
    params: z.object({
        id: z.string().min(1),
    }),
    body: z.object({
        name: z.string().min(1).max(255).trim().optional(),
        description: z.string().max(2000).optional().nullable(),
    }),
});

const idParamSchema = z.object({
    params: z.object({
        id: z.string().min(1),
    }),
});

const assignFlowSchema = z.object({
    params: z.object({
        id: z.string().min(1),
    }),
    body: z.object({
        flowId: z.string().min(1, 'Flow ID is required'),
    }),
});

const getProjectsQuerySchema = z.object({
    query: z.object({
        search: z.string().max(255).optional(),
    }),
});

module.exports = { createProjectSchema, updateProjectSchema, idParamSchema, assignFlowSchema, getProjectsQuerySchema };
