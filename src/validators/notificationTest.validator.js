const { z } = require("zod");

// Dev/test-only: schedule a plan / flow-pack expiry N minutes from now so the
// expiry-checker cron can pick it up and fire mobile notifications on demand.
const testScheduleExpirySchema = z.object({
  body: z.object({
    email: z.string().email("A valid user email is required"),
    // Minutes from now until the row becomes "lapsed". Negative values
    // simulate an already-expired plan (useful for an immediate push).
    expiryMinutes: z.number().int().min(-1440).max(1440).default(2),
    // Which lifecycle to simulate. Only the flow-pack path sends FCM pushes;
    // subscription expiry creates an in-app notification only.
    target: z.enum(["subscription", "flowpack", "both"]).default("both"),
  }),
});

module.exports = { testScheduleExpirySchema };
