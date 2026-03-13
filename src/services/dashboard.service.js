const { prisma } = require('../lib/prisma');

class DashboardService {
    async getStats(userId, appContext = 'free') {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [totalFlows, editedThisMonth, sharedFlows, teamMembers] = await Promise.all([
            // Total non-deleted flows
            prisma.flow.count({
                where: { ownerId: userId, deletedAt: null, appContext },
            }),
            // Flows edited this month
            prisma.flow.count({
                where: {
                    ownerId: userId,
                    deletedAt: null,
                    appContext,
                    updatedAt: { gte: startOfMonth },
                },
            }),
            // Flows shared with others
            prisma.flowShare.count({
                where: { sharedById: userId, appContext },
            }),
            // Team members across all user's teams
            this._getTeamMemberCount(userId),
        ]);

        return { totalFlows, editedThisMonth, sharedFlows, teamMembers };
    }

    async getActivity(userId, appContext = 'free') {
        // Flow activity for last 7 days
        const days = [];
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);
            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);

            const [created, edited] = await Promise.all([
                prisma.flow.count({
                    where: {
                        ownerId: userId,
                        appContext,
                        createdAt: { gte: date, lt: nextDate },
                    },
                }),
                prisma.flow.count({
                    where: {
                        ownerId: userId,
                        appContext,
                        deletedAt: null,
                        updatedAt: { gte: date, lt: nextDate },
                        createdAt: { lt: date }, // exclude newly created
                    },
                }),
            ]);

            days.push({
                date: date.toISOString().split('T')[0],
                label: date.toLocaleDateString('en-US', { weekday: 'short' }),
                created,
                edited,
            });
        }

        return days;
    }

    async getRecentFlows(userId, appContext = 'free', limit = 5) {
        const flows = await prisma.flow.findMany({
            where: {
                ownerId: userId,
                deletedAt: null,
                appContext,
                // Only include flows that have diagram data (non-empty)
                diagramData: { not: '' },
            },
            orderBy: { updatedAt: 'desc' },
            take: limit,
            select: {
                id: true,
                name: true,
                thumbnail: true,
                updatedAt: true,
                isFavorite: true,
            },
        });

        return flows;
    }

    async getTeamActivity(userId, limit = 10) {
        // Get all teams user belongs to
        const teamMembers = await prisma.teamMember.findMany({
            where: { userId },
            select: { teamId: true },
        });
        const teamIds = teamMembers.map(tm => tm.teamId);

        if (teamIds.length === 0) return [];

        // Get all user IDs in those teams
        const allMembers = await prisma.teamMember.findMany({
            where: { teamId: { in: teamIds } },
            select: { userId: true },
        });
        const memberIds = [...new Set(allMembers.map(m => m.userId))];

        // Get recent flow activity from team members (excluding self)
        const recentFlows = await prisma.flow.findMany({
            where: {
                ownerId: { in: memberIds.filter(id => id !== userId) },
                deletedAt: null,
            },
            orderBy: { updatedAt: 'desc' },
            take: limit,
            select: {
                id: true,
                name: true,
                updatedAt: true,
                createdAt: true,
                owner: { select: { id: true, name: true, image: true } },
            },
        });

        return recentFlows.map(f => ({
            id: f.id,
            flowName: f.name,
            userName: f.owner?.name || 'Unknown',
            userImage: f.owner?.image || null,
            action: f.createdAt.getTime() === f.updatedAt.getTime() ? 'created' : 'edited',
            timestamp: f.updatedAt,
        }));
    }

    async _getTeamMemberCount(userId) {
        const teamMembers = await prisma.teamMember.findMany({
            where: { userId },
            select: { teamId: true },
        });
        const teamIds = teamMembers.map(tm => tm.teamId);

        if (teamIds.length === 0) return 0;

        const members = await prisma.teamMember.findMany({
            where: { teamId: { in: teamIds }, userId: { not: userId } },
            select: { userId: true },
        });

        // Deduplicate
        return new Set(members.map(m => m.userId)).size;
    }
}

module.exports = new DashboardService();
