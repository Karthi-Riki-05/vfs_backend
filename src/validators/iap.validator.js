const { z } = require("zod");

// Package names of the native shells (fixed app identities, not env config —
// they match android/app/build.gradle applicationIds).
// The two real published Android packages, verified 2026-07-31 against the
// Play Developer API (both are visible to the service account and own live IAP
// products): `com.valuecharts.app` = Team app (mth_5/mth_10/yr_5/yr_10),
// `com.valuecharts.pro` = Pro app (pro.ltd/pro.unltd). Mirrors
// android/app/build.gradle and _kPackageNames in lib/iap_service.dart.
// Previously listed `com.valuecharts.app.team` and omitted the Pro package —
// neither exists on Play, so Pro purchases were rejected before reaching Google.
const ALLOWED_PACKAGES = ["com.valuecharts.app", "com.valuecharts.pro"];

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
      // Localized store price the buyer saw (from the client's iapPrices). Used
      // only to RECORD the amount + currency; never grants anything. Bounded so
      // a client can't stuff arbitrary data into the transaction ledger.
      priceAmount: z.number().positive().max(10_000_000).optional(),
      currency: z.string().min(1).max(10).optional(),
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
