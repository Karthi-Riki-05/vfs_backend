const { z } = require("zod");

// Package names of the native shells (fixed app identities, not env config —
// they match android/app/build.gradle applicationIds).
const ALLOWED_PACKAGES = ["com.valuecharts.app", "com.valuecharts.app.team"];

const validatePurchaseSchema = z.object({
  body: z
    .object({
      store: z.enum(["google_play", "app_store"]),
      productId: z.string().min(1).max(120),
      // Google: the Play Billing purchaseToken + the shell's package name
      purchaseToken: z.string().min(1).max(4096).optional(),
      packageName: z
        .string()
        .refine((v) => ALLOWED_PACKAGES.includes(v), {
          message: "Unknown package name",
        })
        .optional(),
      // Apple: the base64 app receipt
      receiptData: z.string().min(1).max(1_000_000).optional(),
    })
    .superRefine((data, ctx) => {
      if (data.store === "google_play") {
        if (!data.purchaseToken)
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "purchaseToken is required for google_play",
          });
        if (!data.packageName)
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "packageName is required for google_play",
          });
      }
      if (data.store === "app_store" && !data.receiptData) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "receiptData is required for app_store",
        });
      }
    }),
});

module.exports = { validatePurchaseSchema, ALLOWED_PACKAGES };
