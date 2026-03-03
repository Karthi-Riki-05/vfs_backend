const { prisma } = require('../lib/prisma');
const AppError = require('../utils/AppError');

class TeamService {
    async getTeams(userId, options = {}) {
        const { page = 1, limit = 20 } = options;
        const take = Math.min(Number(limit) || 20, 100);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

        const where = {
            OR: [
                { teamOwnerId: userId },
                { members: { some: { userId } } },
            ],
        };

        const [teams, total] = await Promise.all([
            prisma.team.findMany({
                where, skip, take,
                include: { owner: { select: { id: true, name: true, email: true } }, _count: { select: { members: true } } },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.team.count({ where }),
        ]);

        return { teams, total, page: Number(page) || 1, totalPages: Math.ceil(total / take) };
    }

    async getTeamById(teamId, userId) {
        const team = await prisma.team.findFirst({
            where: {
                id: teamId,
                OR: [{ teamOwnerId: userId }, { members: { some: { userId } } }],
            },
            include: {
                owner: { select: { id: true, name: true, email: true } },
                members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
            },
        });
        if (!team) throw new AppError('Team not found', 404, 'NOT_FOUND');
        return team;
    }

    async createTeam(userId, data = {}) {
        return await prisma.$transaction(async (tx) => {
            const team = await tx.team.create({
                data: {
                    teamOwnerId: userId,
                    appType: data.appType || null,
                    status: 'active',
                    countMem: 1,
                },
                include: { owner: { select: { id: true, name: true, email: true } } },
            });

            // Add owner as first team member
            await tx.teamMember.create({
                data: {
                    teamId: team.id,
                    userId,
                    appType: data.appType || null,
                },
            });

            return team;
        });
    }

    async updateTeam(teamId, userId, data) {
        const team = await prisma.team.findFirst({ where: { id: teamId, teamOwnerId: userId } });
        if (!team) throw new AppError('Team not found or not owner', 404, 'NOT_FOUND');

        const updateData = {};
        if (data.teamMem !== undefined) updateData.teamMem = data.teamMem;
        if (data.status !== undefined) updateData.status = data.status;
        if (data.appType !== undefined) updateData.appType = data.appType;

        return await prisma.team.update({ where: { id: teamId }, data: updateData });
    }

    async deleteTeam(teamId, userId) {
        const team = await prisma.team.findUnique({ where: { id: teamId } });
        if (!team) throw new AppError('Team not found', 404, 'NOT_FOUND');
        if (team.teamOwnerId !== userId) throw new AppError('Only the team owner can delete this team', 403, 'FORBIDDEN');

        // Cascade: delete members then team
        await prisma.$transaction([
            prisma.teamMember.deleteMany({ where: { teamId } }),
            prisma.team.delete({ where: { id: teamId } }),
        ]);
    }

    async getMembers(teamId, userId) {
        const team = await prisma.team.findFirst({
            where: {
                id: teamId,
                OR: [{ teamOwnerId: userId }, { members: { some: { userId } } }],
            },
        });
        if (!team) throw new AppError('Team not found', 404, 'NOT_FOUND');

        return await prisma.teamMember.findMany({
            where: { teamId },
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
        });
    }

    async addMember(teamId, userId, email, appType) {
        const team = await prisma.team.findFirst({ where: { id: teamId, teamOwnerId: userId } });
        if (!team) throw new AppError('Team not found or not owner', 404, 'NOT_FOUND');

        // Check member limit
        if (team.teamMem > 0) {
            const memberCount = await prisma.teamMember.count({ where: { teamId } });
            if (memberCount >= team.teamMem) {
                throw new AppError('Team member limit reached', 400, 'MEMBER_LIMIT');
            }
        }

        const targetUser = await prisma.user.findUnique({ where: { email } });
        if (!targetUser) throw new AppError('User not found with that email', 404, 'USER_NOT_FOUND');

        const existing = await prisma.teamMember.findFirst({
            where: { teamId, userId: targetUser.id },
        });
        if (existing) throw new AppError('User is already a team member', 409, 'CONFLICT');

        const member = await prisma.teamMember.create({
            data: { teamId, userId: targetUser.id, appType: appType || team.appType },
            include: { user: { select: { id: true, name: true, email: true } } },
        });

        // Increment count
        await prisma.team.update({ where: { id: teamId }, data: { countMem: { increment: 1 } } });

        return member;
    }

    async removeMember(teamId, memberUserId, requestingUserId) {
        const team = await prisma.team.findFirst({ where: { id: teamId, teamOwnerId: requestingUserId } });
        if (!team) throw new AppError('Team not found or not owner', 404, 'NOT_FOUND');
        if (memberUserId === requestingUserId) {
            throw new AppError('Cannot remove yourself from your own team', 400, 'BAD_REQUEST');
        }

        const member = await prisma.teamMember.findFirst({ where: { teamId, userId: memberUserId } });
        if (!member) throw new AppError('Member not found in team', 404, 'NOT_FOUND');

        await prisma.teamMember.delete({ where: { id: member.id } });
        await prisma.team.update({ where: { id: teamId }, data: { countMem: { decrement: 1 } } });
    }
}

module.exports = new TeamService();
