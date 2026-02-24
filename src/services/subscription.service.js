const { prisma } = require('../lib/prisma');

class SubscriptionService {
    async getCurrentSubscription(userId) {
        return await prisma.subscription.findUnique({
            where: { userId },
            include: { plan: true }
        });
    }

    async getPlans() {
        return await prisma.plan.findMany({
            orderBy: { tier: 'asc' }
        });
    }

    async subscribeToPlan(userId, planId) {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1); // 1 month from now

        return await prisma.subscription.upsert({
            where: { userId },
            update: {
                planId,
                status: 'active',
                expiresAt
            },
            create: {
                userId,
                planId,
                status: 'active',
                expiresAt
            }
        });
    }

    async cancelSubscription(userId) {
        return await prisma.subscription.update({
            where: { userId },
            data: { status: 'cancelled' }
        });
    }
}

module.exports = new SubscriptionService();
