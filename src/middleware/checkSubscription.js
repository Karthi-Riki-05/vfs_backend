const { prisma } = require('../lib/prisma');
const { getStripe } = require('../lib/stripe');
const logger = require('../utils/logger');

/**
 * Middleware that loads the user's subscription status onto req.subscription.
 * Does NOT block the request — use requireActivePlan after this to block free users.
 */
async function checkSubscription(req, res, next) {
    const userId = req.user?.id;
    if (!userId) {
        req.subscription = { active: false, plan: 'free' };
        return next();
    }

    try {
        const subscription = await prisma.subscription.findUnique({ where: { userId } });

        if (!subscription || subscription.status === 'cancelled') {
            req.subscription = { active: false, plan: 'free' };
            return next();
        }

        const now = new Date();
        const periodEnd = subscription.expiresAt ? new Date(subscription.expiresAt) : null;

        // If period has ended and status is still active, verify with Stripe
        if (periodEnd && now > periodEnd && subscription.status === 'active' && subscription.paymentId) {
            try {
                const stripe = getStripe();
                const stripeSub = await stripe.subscriptions.retrieve(subscription.paymentId);
                if (stripeSub.status !== 'active') {
                    const newStatus = stripeSub.status === 'canceled' ? 'cancelled' : stripeSub.status;
                    await prisma.subscription.update({
                        where: { id: subscription.id },
                        data: { status: newStatus },
                    });
                    subscription.status = newStatus;
                }
            } catch (err) {
                logger.error('Failed to verify subscription with Stripe:', err.message);
            }
        }

        const isActive = subscription.status === 'active' || subscription.status === 'cancelling';
        const isValid = !periodEnd || now <= periodEnd;

        if (isActive && isValid) {
            req.subscription = {
                active: true,
                plan: subscription.productType || 'team',
                teamMemberLimit: subscription.usersCount || 5,
                expiresAt: periodEnd,
                cancelling: subscription.status === 'cancelling',
            };
        } else {
            req.subscription = { active: false, plan: 'free' };
        }
    } catch (err) {
        logger.error('checkSubscription middleware error:', err.message);
        req.subscription = { active: false, plan: 'free' };
    }

    next();
}

/**
 * Blocks the request if the user doesn't have an active subscription.
 * Must be used AFTER checkSubscription.
 */
function requireActivePlan(req, res, next) {
    if (!req.subscription?.active) {
        return res.status(403).json({
            success: false,
            error: {
                code: 'SUBSCRIPTION_REQUIRED',
                message: 'Active subscription required. Please upgrade your plan to use this feature.',
            },
        });
    }
    next();
}

module.exports = { checkSubscription, requireActivePlan };
