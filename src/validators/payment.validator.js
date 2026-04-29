const { z } = require("zod");

const createCheckoutSchema = z.object({
  body: z.object({
    planId: z.string().min(1),
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
  }),
});

const getTransactionsQuerySchema = z.object({
  query: z.object({
    page: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().positive())
      .optional(),
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .optional(),
    // Pro app filters to 'individual' (one-time Pro/flow-pack/addon
    // purchases). Team app filters to 'enterprise' (subscription).
    // Without this field the validator strips it and the controller
    // returns every transaction regardless of app context.
    appType: z.enum(["individual", "enterprise"]).optional(),
  }),
});

module.exports = {
  createCheckoutSchema,
  getTransactionsQuerySchema,
};
