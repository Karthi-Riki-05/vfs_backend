const { prisma } = require('../lib/prisma');
const AppError = require('../utils/AppError');

const FREE_FLOW_LIMIT = 10;

class FlowLimitService {
    async checkAndEnforceLimit(userId, appType) {
        // Check if user is in Pro mode — use Pro flow limits instead
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { hasPro: true, currentVersion: true, proFlowLimit: true, proAdditionalFlowsPurchased: true, proUnlimitedFlows: true },
        });

        if (user?.hasPro && user.currentVersion === 'pro') {
            // Unlimited — no limit
            if (user.proUnlimitedFlows) {
                return { allowed: true, used: 0, total: -1, isPro: true, isUnlimited: true };
            }

            const flowCount = await prisma.flow.count({
                where: { ownerId: userId, deletedAt: null, appContext: 'pro' },
            });
            const maxFlows = user.proFlowLimit + user.proAdditionalFlowsPurchased;

            if (flowCount >= maxFlows) {
                throw new AppError(
                    `Pro flow limit reached. You have used ${flowCount} of ${maxFlows} flows. Purchase additional flows to create more.`,
                    403,
                    'PRO_FLOW_LIMIT_REACHED'
                );
            }

            return { allowed: true, used: flowCount, total: maxFlows, isPro: true };
        }

        // Original ValueChart flow limit logic
        const limit = await prisma.flowLimit.findFirst({
            where: { userId, appType: appType || 'individual' },
        });

        if (!limit) {
            // First time: create limit record
            await prisma.flowLimit.create({
                data: { userId, appType: appType || 'individual', totCount: FREE_FLOW_LIMIT, flowUsed: 0 },
            });
            return { allowed: true, used: 0, total: FREE_FLOW_LIMIT };
        }

        // Check subscription for unlimited
        const subscription = await prisma.subscription.findUnique({
            where: { userId },
            include: { plan: true },
        });

        if (subscription?.status === 'active' && subscription.plan) {
            // Paid users: unlimited (or plan-based limit)
            return { allowed: true, used: limit.flowUsed || 0, total: -1, unlimited: true };
        }

        // Free user: enforce limit
        if ((limit.flowUsed || 0) >= (limit.totCount || FREE_FLOW_LIMIT)) {
            throw new AppError(
                `Flow limit reached. You have used ${limit.flowUsed} of ${limit.totCount} free flows. Upgrade to create more.`,
                403,
                'FLOW_LIMIT_REACHED'
            );
        }

        return { allowed: true, used: limit.flowUsed || 0, total: limit.totCount || FREE_FLOW_LIMIT };
    }

    async incrementUsage(userId, appType) {
        const existing = await prisma.flowLimit.findFirst({
            where: { userId, appType: appType || 'individual' },
        });

        if (existing) {
            await prisma.flowLimit.update({
                where: { id: existing.id },
                data: { flowUsed: { increment: 1 } },
            });
        } else {
            await prisma.flowLimit.create({
                data: { userId, appType: appType || 'individual', totCount: FREE_FLOW_LIMIT, flowUsed: 1 },
            });
        }
    }

    async decrementUsage(userId, appType) {
        const existing = await prisma.flowLimit.findFirst({
            where: { userId, appType: appType || 'individual' },
        });
        if (existing && (existing.flowUsed || 0) > 0) {
            await prisma.flowLimit.update({
                where: { id: existing.id },
                data: { flowUsed: { decrement: 1 } },
            });
        }
    }

    async getUsage(userId) {
        const limits = await prisma.flowLimit.findMany({ where: { userId } });
        return limits;
    }
}

module.exports = new FlowLimitService();
