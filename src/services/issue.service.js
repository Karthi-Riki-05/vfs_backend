const { prisma } = require('../lib/prisma');
const AppError = require('../utils/AppError');

class IssueService {
    async getIssues(userId, options = {}) {
        const { flowId, page = 1, limit = 20 } = options;
        const take = Math.min(Number(limit) || 20, 100);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

        const where = { createdById: userId };
        if (flowId) where.flowId = flowId;

        const [issues, total] = await Promise.all([
            prisma.issueItem.findMany({
                where, skip, take,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.issueItem.count({ where }),
        ]);

        return { issues, total, page: Number(page) || 1, totalPages: Math.ceil(total / take) };
    }

    async getIssueById(id, userId) {
        const issue = await prisma.issueItem.findFirst({
            where: { id, createdById: userId },
        });
        if (!issue) throw new AppError('Issue not found', 404, 'NOT_FOUND');
        return issue;
    }

    async createIssue(userId, data) {
        return await prisma.issueItem.create({
            data: {
                title: data.title,
                flowId: data.flowId,
                flowItemId: data.flowItemId || '',
                createdById: userId,
                appType: data.appType || null,
            },
        });
    }

    async updateIssue(id, userId, data) {
        const issue = await prisma.issueItem.findFirst({ where: { id, createdById: userId } });
        if (!issue) throw new AppError('Issue not found', 404, 'NOT_FOUND');

        const updateData = {};
        if (data.title !== undefined) updateData.title = data.title;
        if (data.isChecked !== undefined) updateData.isChecked = data.isChecked;

        return await prisma.issueItem.update({ where: { id }, data: updateData });
    }

    async deleteIssue(id, userId) {
        const issue = await prisma.issueItem.findFirst({ where: { id, createdById: userId } });
        if (!issue) throw new AppError('Issue not found', 404, 'NOT_FOUND');
        await prisma.issueItem.delete({ where: { id } });
    }
}

module.exports = new IssueService();
