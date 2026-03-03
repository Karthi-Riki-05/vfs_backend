const { z } = require('zod');

const updateUserSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        name: z.string().min(1).max(100).trim().optional(),
        email: z.string().email().max(255).trim().toLowerCase().optional(),
        contactNo: z.string().max(20).optional(),
        photo: z.string().max(500).optional(),
        welcomeUser: z.boolean().optional(),
    }),
});

const changePasswordSchema = z.object({
    body: z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8).max(128),
    }),
});

const forgotPasswordSchema = z.object({
    body: z.object({
        email: z.string().email().max(255).trim().toLowerCase(),
    }),
});

const resetPasswordSchema = z.object({
    body: z.object({
        token: z.string().min(1),
        password: z.string().min(8).max(128),
    }),
});

const getUsersQuerySchema = z.object({
    query: z.object({
        search: z.string().max(255).optional(),
        page: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive()).optional(),
        limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100)).optional(),
    }),
});

const idParamSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
});

module.exports = {
    updateUserSchema,
    changePasswordSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    getUsersQuerySchema,
    idParamSchema,
};
