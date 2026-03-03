const { z } = require('zod');

const subscribeSchema = z.object({
    body: z.object({
        planId: z.string().min(1, 'Plan ID is required'),
    }),
});

module.exports = { subscribeSchema };
