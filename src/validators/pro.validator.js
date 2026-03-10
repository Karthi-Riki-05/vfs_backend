const { z } = require('zod');

const switchAppSchema = z.object({
    body: z.object({
        app: z.enum(['free', 'pro']),
    }),
});

const buyFlowsSchema = z.object({
    body: z.object({
        package: z.enum(['50', 'unlimited'], {
            errorMap: () => ({ message: 'package must be "50" or "unlimited"' }),
        }),
    }),
});

module.exports = { switchAppSchema, buyFlowsSchema };
