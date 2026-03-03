const { z } = require('zod');

const adminUsersQuerySchema = z.object({
    query: z.object({
        search: z.string().max(255).optional(),
        role: z.string().optional(),
        status: z.enum(['draft', 'success', 'deleted']).optional(),
        page: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive()).optional(),
        limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100)).optional(),
    }),
});

const adminUpdateUserSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        role: z.string().optional(),
        userStatus: z.enum(['draft', 'success', 'deleted']).optional(),
        userType: z.enum(['free_user', 'pro_user', 'admin']).optional(),
    }),
});

const adminCreatePlanSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(255).trim(),
        duration: z.enum(['monthly', 'yearly']).default('monthly'),
        price: z.number().min(0),
        freeTrial: z.number().int().min(0).optional(),
        gracePeriod: z.number().int().min(0).optional(),
        userAccess: z.boolean().optional(),
        userCount: z.number().int().optional(),
        userCost: z.number().optional(),
        status: z.enum(['active', 'inactive']).default('active'),
        features: z.any().optional(),
        tier: z.number().int().default(0),
        appType: z.enum(['enterprise', 'individual']).optional(),
    }),
});

const adminUpdatePlanSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        name: z.string().min(1).max(255).trim().optional(),
        price: z.number().min(0).optional(),
        status: z.enum(['active', 'inactive']).optional(),
        features: z.any().optional(),
        tier: z.number().int().optional(),
        userCount: z.number().int().optional(),
        userCost: z.number().optional(),
        freeTrial: z.number().int().min(0).optional(),
        gracePeriod: z.number().int().min(0).optional(),
    }),
});

const adminCreateOfferSchema = z.object({
    body: z.object({
        offName: z.string().max(255).optional(),
        type: z.string().optional(),
        planOffer: z.string().min(1),
        userOffer: z.string().optional(),
        startDate: z.string().datetime().optional(),
        expiredDate: z.string().datetime().optional(),
        status: z.enum(['active', 'inactive']).default('active'),
    }),
});

const adminUpdateOfferSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        offName: z.string().max(255).optional(),
        planOffer: z.string().optional(),
        status: z.enum(['active', 'inactive']).optional(),
        expiredDate: z.string().datetime().optional(),
    }),
});

const adminFeedbackUpdateSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        response: z.string().max(5000).optional(),
    }),
});

const adminSubscriptionsQuerySchema = z.object({
    query: z.object({
        status: z.string().optional(),
        appType: z.enum(['enterprise', 'individual']).optional(),
        page: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive()).optional(),
        limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100)).optional(),
    }),
});

const adminTransactionsQuerySchema = z.object({
    query: z.object({
        status: z.string().optional(),
        page: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive()).optional(),
        limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100)).optional(),
    }),
});

const idParamSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
});

module.exports = {
    adminUsersQuerySchema,
    adminUpdateUserSchema,
    adminCreatePlanSchema,
    adminUpdatePlanSchema,
    adminCreateOfferSchema,
    adminUpdateOfferSchema,
    adminFeedbackUpdateSchema,
    adminSubscriptionsQuerySchema,
    adminTransactionsQuerySchema,
    idParamSchema,
};
