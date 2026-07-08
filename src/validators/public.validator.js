const { z } = require("zod");

const contactSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1, "Name is required").max(120),
    email: z.string().trim().email("Valid email is required").max(254),
    phone: z.string().trim().max(40).optional().or(z.literal("")),
    subject: z.string().trim().max(200).optional().or(z.literal("")),
    message: z.string().trim().max(5000).optional().or(z.literal("")),
    // Which public form sent this ("contact" | "support" | "feedback")
    source: z.string().trim().max(30).optional().or(z.literal("")),
    // Google reCAPTCHA v3 token (required when RECAPTCHA_SECRET is configured)
    captchaToken: z.string().trim().max(3000).optional().or(z.literal("")),
  }),
});

const assistantSchema = z.object({
  body: z.object({
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().trim().min(1).max(2000),
        }),
      )
      .min(1, "At least one message is required")
      .max(20),
  }),
});

module.exports = { contactSchema, assistantSchema };
