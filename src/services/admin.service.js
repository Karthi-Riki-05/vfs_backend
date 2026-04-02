const { prisma } = require('../lib/prisma');
const AppError = require('../utils/AppError');

class AdminService {
    async getUsers(options = {}) {
        const { search, role, status, page = 1, limit = 20 } = options;
        const take = Math.min(Number(limit) || 20, 100);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (role) where.role = role;
        if (status) where.userStatus = status;

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where, skip, take,
                select: {
                    id: true, name: true, email: true, role: true, userType: true,
                    userStatus: true, clientType: true, createdAt: true,
                    subscription: { select: { id: true, status: true, plan: { select: { name: true } } } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.user.count({ where }),
        ]);

        return { users, total, page: Number(page) || 1, totalPages: Math.ceil(total / take) };
    }

    async updateUser(id, data) {
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

        const updateData = {};
        if (data.role !== undefined) updateData.role = data.role;
        if (data.userStatus !== undefined) updateData.userStatus = data.userStatus;
        if (data.userType !== undefined) updateData.userType = data.userType;

        return await prisma.user.update({
            where: { id },
            data: updateData,
            select: { id: true, name: true, email: true, role: true, userType: true, userStatus: true },
        });
    }

    async getPlans() {
        return await prisma.plan.findMany({ orderBy: { tier: 'asc' } });
    }

    async createPlan(data) {
        return await prisma.plan.create({ data });
    }

    async updatePlan(id, data) {
        const plan = await prisma.plan.findUnique({ where: { id } });
        if (!plan) throw new AppError('Plan not found', 404, 'NOT_FOUND');
        return await prisma.plan.update({ where: { id }, data });
    }

    async getSubscriptions(options = {}) {
        const { status, appType, page = 1, limit = 20 } = options;
        const take = Math.min(Number(limit) || 20, 100);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

        const where = {};
        if (status) where.status = status;
        if (appType) where.appType = appType;

        const [subscriptions, total] = await Promise.all([
            prisma.subscription.findMany({
                where, skip, take,
                include: {
                    user: { select: { id: true, name: true, email: true } },
                    plan: { select: { id: true, name: true, price: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.subscription.count({ where }),
        ]);

        return { subscriptions, total, page: Number(page) || 1, totalPages: Math.ceil(total / take) };
    }

    async getTransactions(options = {}) {
        const { status, page = 1, limit = 20 } = options;
        const take = Math.min(Number(limit) || 20, 100);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

        const where = {};
        if (status) where.status = status;

        const [transactions, total] = await Promise.all([
            prisma.transactionLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
            prisma.transactionLog.count({ where }),
        ]);

        return { transactions, total, page: Number(page) || 1, totalPages: Math.ceil(total / take) };
    }

    async getFeedback(options = {}) {
        const { page = 1, limit = 20 } = options;
        const take = Math.min(Number(limit) || 20, 100);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

        const [feedback, total] = await Promise.all([
            prisma.feedbackQuery.findMany({
                skip, take,
                include: { user: { select: { id: true, name: true, email: true } } },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.feedbackQuery.count(),
        ]);

        return { feedback, total, page: Number(page) || 1, totalPages: Math.ceil(total / take) };
    }

    async getOffers() {
        return await prisma.offer.findMany({ orderBy: { createdAt: 'desc' } });
    }

    async createOffer(data) {
        return await prisma.offer.create({
            data: {
                offName: data.offName,
                type: data.type,
                planOffer: data.planOffer,
                userOffer: data.userOffer,
                startDate: data.startDate ? new Date(data.startDate) : null,
                expiredDate: data.expiredDate ? new Date(data.expiredDate) : null,
                status: data.status || 'active',
            },
        });
    }

    async updateOffer(id, data) {
        const offer = await prisma.offer.findUnique({ where: { id } });
        if (!offer) throw new AppError('Offer not found', 404, 'NOT_FOUND');

        const updateData = {};
        if (data.offName !== undefined) updateData.offName = data.offName;
        if (data.planOffer !== undefined) updateData.planOffer = data.planOffer;
        if (data.status !== undefined) updateData.status = data.status;
        if (data.expiredDate !== undefined) updateData.expiredDate = new Date(data.expiredDate);

        return await prisma.offer.update({ where: { id }, data: updateData });
    }

    async deleteOffer(id) {
        const offer = await prisma.offer.findUnique({ where: { id } });
        if (!offer) throw new AppError('Offer not found', 404, 'NOT_FOUND');
        await prisma.offer.delete({ where: { id } });
    }

    async createPromoCode(data) {
        return await prisma.promoCode.create({
            data: {
                promoCode: data.promoCode,
                discountPercentage: data.discountPercentage,
                validUpto: data.validUpto ? new Date(data.validUpto) : null,
            },
        });
    }

    async getStats() {
        const [totalUsers, activeSubscriptions, totalFlows, totalTeams, totalRevenue] = await Promise.all([
            prisma.user.count({ where: { userStatus: 'success' } }),
            prisma.subscription.count({ where: { status: 'active' } }),
            prisma.flow.count(),
            prisma.team.count(),
            prisma.transactionLog.aggregate({ _sum: { amountCharged: true }, where: { status: 'success' } }),
        ]);

        return {
            totalUsers,
            activeSubscriptions,
            totalFlows,
            totalTeams,
            totalRevenue: (totalRevenue._sum.amountCharged || 0) / 100,
        };
    }
}

module.exports = new AdminService();
