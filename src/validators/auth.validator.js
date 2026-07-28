const { z } = require("zod");

const registerSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required").max(100).trim(),
    email: z
      .string()
      .email("Invalid email address")
      .max(255)
      .trim()
      .toLowerCase(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128),
  }),
});

const validateSchema = z.object({
  body: z.object({
    email: z
      .string()
      .email("Invalid email address")
      .max(255)
      .trim()
      .toLowerCase(),
    password: z.string().min(1, "Password is required").max(128),
  }),
});

const oauthSyncSchema = z.object({
  body: z.object({
    email: z
      .string()
      .email("Invalid email address")
      .max(255)
      .trim()
      .toLowerCase(),
    name: z.string().max(100).trim().optional(),
    image: z.string().max(500).optional(),
    provider: z.string().min(1).max(50),
    // Without these, Zod strips them (validate.js replaces req.body with the
    // parsed result) and the Account.upsert guard `if (provider && providerAccountId)`
    // skips — so the OAuth link is never written. See bug-003.
    providerAccountId: z.union([z.string(), z.number()]).optional(),
    accountType: z.string().max(50).optional(),
    // bug-082: did the provider assert this email as verified? Absent/false =>
    // the email is NOT an identity key. Must be declared here for the same
    // bug-003 reason — validate.js replaces req.body with the parsed result.
    // LinkedIn sends the OIDC claim as the string "true", hence the union.
    emailVerified: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .optional()
      .transform((v) => v === true || v === "true"),
  }),
});

const resendVerificationSchema = z.object({
  body: z.object({
    email: z
      .string()
      .email("Invalid email address")
      .max(255)
      .trim()
      .toLowerCase(),
  }),
});

const verifyOtpSchema = z.object({
  body: z.object({
    email: z
      .string()
      .email("Invalid email address")
      .max(255)
      .trim()
      .toLowerCase(),
    otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
  }),
});

module.exports = {
  registerSchema,
  validateSchema,
  oauthSyncSchema,
  resendVerificationSchema,
  verifyOtpSchema,
};
