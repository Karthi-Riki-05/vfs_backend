const { prisma } = require('../lib/prisma');
const AppError = require('../utils/AppError');
const crypto = require('crypto');
const { sendTeamInviteEmail } = require('../utils/email');

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
                include: {
                    owner: { select: { id: true, name: true, email: true } },
                    members: { take: 5, include: { user: { select: { id: true, name: true, image: true } } } },
                    _count: { select: { members: true } },
                },
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
                members: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
            },
        });
        if (!team) throw new AppError('Team not found', 404, 'NOT_FOUND');
        return team;
    }

    async createTeam(userId, data = {}) {
        return await prisma.$transaction(async (tx) => {
            const team = await tx.team.create({
                data: {
                    name: data.name || null,
                    description: data.description || null,
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
                    role: 'OWNER',
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
        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.teamMem !== undefined) updateData.teamMem = data.teamMem;
        if (data.status !== undefined) updateData.status = data.status;
        if (data.appType !== undefined) updateData.appType = data.appType;

        return await prisma.team.update({ where: { id: teamId }, data: updateData });
    }

    async deleteTeam(teamId, userId) {
        const team = await prisma.team.findUnique({ where: { id: teamId } });
        if (!team) throw new AppError('Team not found', 404, 'NOT_FOUND');
        if (team.teamOwnerId !== userId) throw new AppError('Only the team owner can delete this team', 403, 'FORBIDDEN');

        // Cascade: delete invites, members, then team
        await prisma.$transaction([
            prisma.teamInvite.deleteMany({ where: { teamId } }),
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
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
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
            data: { teamId, userId: targetUser.id, role: 'MEMBER', appType: appType || team.appType },
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
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

    async createInvite(teamId, userId, emails) {
        const team = await prisma.team.findFirst({ where: { id: teamId, teamOwnerId: userId } });
        if (!team) throw new AppError('Team not found or not owner', 404, 'NOT_FOUND');

        const inviter = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const results = [];

        for (const email of emails) {
            const trimmed = email.trim().toLowerCase();
            if (!trimmed) continue;

            // Check if already a member
            const existingUser = await prisma.user.findUnique({ where: { email: trimmed } });
            if (existingUser) {
                const existingMember = await prisma.teamMember.findFirst({ where: { teamId, userId: existingUser.id } });
                if (existingMember) {
                    // If single email invite, throw error for clear frontend feedback
                    if (emails.length === 1) {
                        throw new AppError('This email is already a member of this team', 409, 'ALREADY_MEMBER');
                    }
                    results.push({ email: trimmed, status: 'already_member' });
                    continue;
                }
            }

            // Check for existing pending invite
            const existingInvite = await prisma.teamInvite.findFirst({
                where: { teamId, email: trimmed, status: 'pending', expiresAt: { gt: new Date() } },
            });
            if (existingInvite) {
                results.push({ email: trimmed, status: 'already_invited' });
                continue;
            }

            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

            const invite = await prisma.teamInvite.create({
                data: { teamId, email: trimmed, token, status: 'pending', expiresAt },
            });

            const acceptUrl = `${baseUrl}/dashboard/teams/accept?token=${token}`;

            try {
                await sendTeamInviteEmail({
                    to: trimmed,
                    teamName: team.name || `Team #${team.id.slice(-6)}`,
                    inviterName: inviter?.name || 'A team member',
                    acceptUrl,
                });
                results.push({ email: trimmed, status: 'sent', inviteId: invite.id });
            } catch {
                results.push({ email: trimmed, status: 'email_failed', inviteId: invite.id });
            }
        }

        return results;
    }

    async acceptInvite(token, userId) {
        const invite = await prisma.teamInvite.findUnique({ where: { token } });
        if (!invite) throw new AppError('Invalid invitation', 404, 'NOT_FOUND');
        if (invite.status !== 'pending') throw new AppError('Invitation already used', 400, 'BAD_REQUEST');
        if (invite.expiresAt < new Date()) {
            await prisma.teamInvite.update({ where: { id: invite.id }, data: { status: 'expired' } });
            throw new AppError('Invitation has expired', 400, 'EXPIRED');
        }

        // Check if user is already a member
        const existing = await prisma.teamMember.findFirst({ where: { teamId: invite.teamId, userId } });
        if (existing) {
            await prisma.teamInvite.update({ where: { id: invite.id }, data: { status: 'accepted' } });
            return { alreadyMember: true, teamId: invite.teamId };
        }

        await prisma.$transaction([
            prisma.teamMember.create({
                data: { teamId: invite.teamId, userId, role: 'MEMBER', appType: null },
            }),
            prisma.team.update({
                where: { id: invite.teamId },
                data: { countMem: { increment: 1 } },
            }),
            prisma.teamInvite.update({
                where: { id: invite.id },
                data: { status: 'accepted' },
            }),
        ]);

        return { teamId: invite.teamId };
    }

    async listPendingInvites(teamId, userId) {
        const team = await prisma.team.findFirst({
            where: { id: teamId, OR: [{ teamOwnerId: userId }, { members: { some: { userId } } }] },
        });
        if (!team) throw new AppError('Team not found', 404, 'NOT_FOUND');

        return await prisma.teamInvite.findMany({
            where: { teamId, status: 'pending', expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' },
        });
    }
}

module.exports = new TeamService();
