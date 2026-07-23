const { z } = require("zod");

const subscribeSchema = z.object({
  body: z.object({
    planId: z.string().min(1, "Plan ID is required"),
  }),
});

// Owner decision 2026-07-23: team plans cap at 25 seats on ALL platforms
// (web + native). The old 50/75/100 web-only tiers were retired.
const TEAM_MEMBER_OPTIONS = [5, 10, 15, 20, 25];

const createCheckoutSchema = z.object({
  body: z.object({
    plan: z.enum(["monthly", "yearly"]),
    teamMembers: z.number().refine((val) => TEAM_MEMBER_OPTIONS.includes(val), {
      message: "Team members must be one of: 5, 10, 15, 20, 25",
    }),
    paymentMethodId: z.string().optional(),
  }),
});

const changePlanSchema = z.object({
  body: z.object({
    plan: z.enum(["monthly", "yearly"]),
    teamMembers: z.number().refine((val) => TEAM_MEMBER_OPTIONS.includes(val), {
      message: "Team members must be one of: 5, 10, 15, 20, 25",
    }),
  }),
});

const verifySessionSchema = z.object({
  body: z.object({
    sessionId: z.string().min(1, "Session ID is required"),
  }),
});

module.exports = {
  subscribeSchema,
  createCheckoutSchema,
  changePlanSchema,
  verifySessionSchema,
};
