const { prisma } = require('../lib/prisma');
const logger = require('../utils/logger');

/**
 * Middleware that checks team/chat access based on app context.
 * - Pro users (currentVersion === 'pro' && hasPro): full access, no subscription needed
 * - ValueChart users: require active subscription (falls through to checkSubscription + requireActivePlan)
 *
 * Must be used AFTER authenticate middleware (needs req.user).
 */
async function checkTeamAccess(req, res, next) {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { hasPro: true, currentVersion: true },
        });

        // Pro users in Pro mode get full access — no subscription needed
        if (user?.hasPro && user.currentVersion === 'pro') {
            // Set a mock subscription so downstream code (like addMember teamMemberLimit) doesn't break
            req.subscription = { active: true, plan: 'pro', teamMemberLimit: 999 };
            return next();
        }

        // ValueChart users — need subscription check via existing middleware chain
        // Load subscription status
        const { checkSubscription, requireActivePlan } = require('./checkSubscription');
        checkSubscription(req, res, (err) => {
            if (err) return next(err);
            requireActivePlan(req, res, next);
        });
    } catch (err) {
        logger.error('checkTeamAccess error:', err.message);
        return res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to check access' },
        });
    }
}

module.exports = { checkTeamAccess };
