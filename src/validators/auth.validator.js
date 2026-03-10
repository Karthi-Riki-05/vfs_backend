const { z } = require('zod');

const registerSchema = z.object({
    body: z.object({
        name: z.string().min(1, 'Name is required').max(100).trim(),
        email: z.string().email('Invalid email address').max(255).trim().toLowerCase(),
        password: z.string().min(8, 'Password must be at least 8 characters').max(128),
    }),
});

const validateSchema = z.object({
    body: z.object({
        email: z.string().email('Invalid email address').max(255).trim().toLowerCase(),
        password: z.string().min(1, 'Password is required').max(128),
    }),
});

const oauthSyncSchema = z.object({
    body: z.object({
        email: z.string().email('Invalid email address').max(255).trim().toLowerCase(),
        name: z.string().max(100).trim().optional(),
        image: z.string().max(500).optional(),
        provider: z.string().min(1).max(50),
    }),
});

module.exports = { registerSchema, validateSchema, oauthSyncSchema };
