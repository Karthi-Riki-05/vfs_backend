const { prisma } = require('../lib/prisma');
const AppError = require('../utils/AppError');

class ChatService {
    async getChatGroups(userId) {
        return await prisma.chatGroup.findMany({
            where: {
                OR: [
                    { userId },
                    { members: { some: { userId } } },
                ],
            },
            include: {
                _count: { select: { messages: true, members: true } },
                messages: { take: 1, orderBy: { createdAt: 'desc' }, select: { message: true, createdAt: true, type: true } },
            },
            orderBy: { updatedAt: 'desc' },
        });
    }

    async createChatGroup(userId, data) {
        const group = await prisma.chatGroup.create({
            data: {
                title: data.title,
                userId,
                flowId: data.flowId || 0,
                flowItemId: data.flowItemId || '',
                appType: data.appType || null,
            },
        });

        // Add creator as member
        await prisma.chatGroupUser.create({ data: { userId, groupId: group.id } });

        // Add additional members
        if (data.memberIds?.length) {
            await prisma.chatGroupUser.createMany({
                data: data.memberIds.filter(id => id !== userId).map(id => ({ userId: id, groupId: group.id })),
                skipDuplicates: true,
            });
        }

        return group;
    }

    async getMessages(groupId, userId, options = {}) {
        const { page = 1, limit = 50 } = options;
        const take = Math.min(Number(limit) || 50, 100);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

        // Verify user is member
        const isMember = await prisma.chatGroupUser.findFirst({
            where: { groupId, userId },
        });
        if (!isMember) {
            const isOwner = await prisma.chatGroup.findFirst({ where: { id: groupId, userId } });
            if (!isOwner) throw new AppError('Not a member of this chat group', 403, 'FORBIDDEN');
        }

        const [messages, total] = await Promise.all([
            prisma.chatMessage.findMany({
                where: { groupId },
                skip, take,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { id: true, name: true, email: true } } },
            }),
            prisma.chatMessage.count({ where: { groupId } }),
        ]);

        return { messages: messages.reverse(), total, page: Number(page) || 1, totalPages: Math.ceil(total / take) };
    }

    async sendMessage(groupId, userId, data) {
        // Verify membership
        const isMember = await prisma.chatGroupUser.findFirst({ where: { groupId, userId } });
        const isOwner = !isMember ? await prisma.chatGroup.findFirst({ where: { id: groupId, userId } }) : true;
        if (!isMember && !isOwner) throw new AppError('Not a member of this chat group', 403, 'FORBIDDEN');

        const message = await prisma.chatMessage.create({
            data: {
                message: data.message,
                groupId,
                userId,
                type: data.type || 'text',
                attachPath: data.attachPath || null,
            },
            include: { user: { select: { id: true, name: true, email: true } } },
        });

        // Update group timestamp
        await prisma.chatGroup.update({ where: { id: groupId }, data: { updatedAt: new Date() } });

        // Create read receipt entries for all other members
        const members = await prisma.chatGroupUser.findMany({
            where: { groupId, userId: { not: userId } },
        });

        if (members.length > 0) {
            await prisma.chatMessageUser.createMany({
                data: members.map(m => ({
                    msgId: message.id,
                    senderId: userId,
                    receiverId: m.userId,
                    groupId,
                    isRead: false,
                })),
            });
        }

        return message;
    }

    async addMember(groupId, userId, targetUserId) {
        // Verify requester is group creator
        const group = await prisma.chatGroup.findFirst({ where: { id: groupId, userId } });
        if (!group) throw new AppError('Chat group not found or not the creator', 403, 'FORBIDDEN');

        // Check target user exists
        const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
        if (!targetUser) throw new AppError('User not found', 404, 'NOT_FOUND');

        // Check not already a member
        const existing = await prisma.chatGroupUser.findFirst({ where: { groupId, userId: targetUserId } });
        if (existing) throw new AppError('User is already a member', 409, 'CONFLICT');

        return await prisma.chatGroupUser.create({
            data: { groupId, userId: targetUserId },
            include: { user: { select: { id: true, name: true, email: true } } },
        });
    }

    async markMessageRead(messageId, userId) {
        await prisma.chatMessageUser.updateMany({
            where: { msgId: messageId, receiverId: userId, isRead: false },
            data: { isRead: true },
        });
    }
}

module.exports = new ChatService();
