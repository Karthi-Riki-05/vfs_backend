const { z } = require('zod');

const subscribeSchema = z.object({
    body: z.object({
        planId: z.string().min(1, 'Plan ID is required'),
    }),
});

const TEAM_MEMBER_OPTIONS = [5, 10, 15, 20, 25, 30];

const createCheckoutSchema = z.object({
    body: z.object({
        plan: z.enum(['monthly', 'yearly']),
        teamMembers: z.number().refine(val => TEAM_MEMBER_OPTIONS.includes(val), {
            message: 'Team members must be one of: 5, 10, 15, 20, 25, 30',
        }),
    }),
});

const changePlanSchema = z.object({
    body: z.object({
        plan: z.enum(['monthly', 'yearly']),
        teamMembers: z.number().refine(val => TEAM_MEMBER_OPTIONS.includes(val), {
            message: 'Team members must be one of: 5, 10, 15, 20, 25, 30',
        }),
    }),
});

const verifySessionSchema = z.object({
    body: z.object({
        sessionId: z.string().min(1, 'Session ID is required'),
    }),
});

module.exports = { subscribeSchema, createCheckoutSchema, changePlanSchema, verifySessionSchema };
