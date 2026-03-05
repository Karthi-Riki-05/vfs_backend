const { z } = require('zod');

const createTeamSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(255).trim().optional(),
        description: z.string().max(2000).trim().optional(),
        appType: z.enum(['enterprise', 'individual']).optional(),
    }),
});

const updateTeamSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        name: z.string().min(1).max(255).trim().optional(),
        description: z.string().max(2000).trim().optional(),
        teamMem: z.number().int().min(0).optional(),
        status: z.enum(['active', 'inactive']).optional(),
        appType: z.enum(['enterprise', 'individual']).optional(),
    }),
});

const addMemberSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        email: z.string().email().max(255).trim().toLowerCase(),
        appType: z.enum(['enterprise', 'individual']).optional(),
    }),
});

const removeMemberSchema = z.object({
    params: z.object({
        id: z.string().min(1),
        uid: z.string().min(1),
    }),
});

const inviteSchema = z.object({
    body: z.object({
        teamId: z.string().min(1),
        email: z.string().email().max(255).trim().toLowerCase().optional(),
        emails: z.array(z.string().email().max(255).trim().toLowerCase()).optional(),
        appType: z.enum(['enterprise', 'individual']).optional(),
    }).refine(data => data.email || (data.emails && data.emails.length > 0), {
        message: 'Either email or emails is required',
    }),
});

const idParamSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
});

const getTeamsQuerySchema = z.object({
    query: z.object({
        page: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive()).optional(),
        limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100)).optional(),
    }),
});

module.exports = {
    createTeamSchema,
    updateTeamSchema,
    addMemberSchema,
    removeMemberSchema,
    inviteSchema,
    idParamSchema,
    getTeamsQuerySchema,
};
