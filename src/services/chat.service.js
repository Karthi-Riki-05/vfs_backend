const { prisma } = require('../lib/prisma');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

// Simple in-memory link preview cache (URL -> preview data, expires after 1 hour)
const linkPreviewCache = new Map();
const CACHE_TTL = 60 * 60 * 1000;

class ChatService {
    async getChatGroups(userId) {
        const groups = await prisma.chatGroup.findMany({
            where: {
                OR: [
                    { userId },
                    { members: { some: { userId } } },
                ],
            },
            include: {
                _count: { select: { messages: true, members: true } },
                messages: { take: 1, orderBy: { createdAt: 'desc' }, select: { message: true, createdAt: true, type: true } },
                members: {
                    where: { userId },
                    select: { lastReadAt: true },
                    take: 1,
                },
            },
            orderBy: { updatedAt: 'desc' },
        });

        // Compute unread counts per group
        const groupsWithUnread = await Promise.all(groups.map(async (group) => {
            const memberRecord = group.members[0];
            const lastReadAt = memberRecord?.lastReadAt;

            let unreadCount = 0;
            if (lastReadAt) {
                unreadCount = await prisma.chatMessageUser.count({
                    where: {
                        groupId: group.id,
                        receiverId: userId,
                        isRead: false,
                        createdAt: { gt: lastReadAt },
                    },
                });
            } else {
                unreadCount = await prisma.chatMessageUser.count({
                    where: {
                        groupId: group.id,
                        receiverId: userId,
                        isRead: false,
                    },
                });
            }

            const { members: _m, ...rest } = group;
            return { ...rest, unreadCount };
        }));

        return groupsWithUnread;
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
        const { page = 1, limit = 50, after } = options;
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

        // If 'after' is provided, fetch messages since that timestamp (for reconnection sync)
        const whereClause = { groupId };
        if (after) {
            whereClause.createdAt = { gt: new Date(after) };
        }

        const [messages, total] = await Promise.all([
            prisma.chatMessage.findMany({
                where: whereClause,
                skip: after ? undefined : skip,
                take: after ? undefined : take,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: { select: { id: true, name: true, email: true, image: true } },
                    files: { select: { id: true, fileName: true, fileType: true, fileSize: true, filePath: true } },
                    msgUsers: {
                        where: { receiverId: { not: undefined } },
                        select: { receiverId: true, isRead: true },
                    },
                },
            }),
            prisma.chatMessage.count({ where: whereClause }),
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
            include: {
                user: { select: { id: true, name: true, email: true, image: true } },
                files: true,
            },
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

        // Emit via Socket.IO if available
        try {
            const { getIO } = require('../socket');
            const io = getIO();
            if (io) {
                // Emit to the chat group room
                io.to(`chat:${groupId}`).emit('message:new', {
                    ...message,
                    groupId,
                });

                // Emit unread count update to each offline/other member
                for (const member of members) {
                    const unreadCount = await prisma.chatMessageUser.count({
                        where: { receiverId: member.userId, isRead: false },
                    });
                    io.to(`user:${member.userId}`).emit('notification:unread-count', {
                        totalUnread: unreadCount,
                        groupId,
                    });
                }
            }
        } catch (err) {
            logger.error('Socket emit error:', err.message);
        }

        // Extract link preview asynchronously (don't block response)
        if (data.type === 'text' || !data.type) {
            this._extractLinkPreview(message.id, data.message).catch(err => {
                logger.error('Link preview error:', err.message);
            });
        }

        return message;
    }

    async createFileMessage(groupId, userId, fileData) {
        // Verify membership
        const isMember = await prisma.chatGroupUser.findFirst({ where: { groupId, userId } });
        const isOwner = !isMember ? await prisma.chatGroup.findFirst({ where: { id: groupId, userId } }) : true;
        if (!isMember && !isOwner) throw new AppError('Not a member of this chat group', 403, 'FORBIDDEN');

        const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileData.originalname);
        const msgType = isImage ? 'image' : 'docs';

        // Create message + file record in transaction
        const result = await prisma.$transaction(async (tx) => {
            const message = await tx.chatMessage.create({
                data: {
                    message: fileData.originalname,
                    groupId,
                    userId,
                    type: msgType,
                    attachPath: fileData.url,
                },
            });

            const chatFile = await tx.chatFile.create({
                data: {
                    messageId: message.id,
                    fileName: fileData.originalname,
                    fileType: fileData.mimetype,
                    fileSize: fileData.size,
                    filePath: fileData.url,
                },
            });

            return { message, chatFile };
        });

        // Update group timestamp
        await prisma.chatGroup.update({ where: { id: groupId }, data: { updatedAt: new Date() } });

        // Create read receipts
        const members = await prisma.chatGroupUser.findMany({
            where: { groupId, userId: { not: userId } },
        });
        if (members.length > 0) {
            await prisma.chatMessageUser.createMany({
                data: members.map(m => ({
                    msgId: result.message.id,
                    senderId: userId,
                    receiverId: m.userId,
                    groupId,
                    isRead: false,
                })),
            });
        }

        // Fetch full message with relations
        const fullMessage = await prisma.chatMessage.findUnique({
            where: { id: result.message.id },
            include: {
                user: { select: { id: true, name: true, email: true, image: true } },
                files: true,
            },
        });

        // Emit via Socket.IO
        try {
            const { getIO } = require('../socket');
            const io = getIO();
            if (io) {
                io.to(`chat:${groupId}`).emit('message:new', { ...fullMessage, groupId });
                for (const member of members) {
                    const unreadCount = await prisma.chatMessageUser.count({
                        where: { receiverId: member.userId, isRead: false },
                    });
                    io.to(`user:${member.userId}`).emit('notification:unread-count', {
                        totalUnread: unreadCount,
                        groupId,
                    });
                }
            }
        } catch (err) {
            logger.error('Socket emit error:', err.message);
        }

        return fullMessage;
    }

    async getFile(fileId, userId) {
        const file = await prisma.chatFile.findUnique({
            where: { id: fileId },
            include: { message: { select: { groupId: true } } },
        });
        if (!file) throw new AppError('File not found', 404, 'NOT_FOUND');

        // Verify membership
        const groupId = file.message.groupId;
        const isMember = await prisma.chatGroupUser.findFirst({ where: { groupId, userId } });
        const isOwner = !isMember ? await prisma.chatGroup.findFirst({ where: { id: groupId, userId } }) : true;
        if (!isMember && !isOwner) throw new AppError('Access denied', 403, 'FORBIDDEN');

        return file;
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

    async markGroupRead(groupId, userId) {
        // Mark all unread messages in this group as read
        await prisma.chatMessageUser.updateMany({
            where: { groupId, receiverId: userId, isRead: false },
            data: { isRead: true },
        });

        // Update lastReadAt
        await prisma.chatGroupUser.updateMany({
            where: { groupId, userId },
            data: { lastReadAt: new Date() },
        });

        // Emit read receipt via socket
        try {
            const { getIO } = require('../socket');
            const io = getIO();
            if (io) {
                io.to(`chat:${groupId}`).emit('message:read', { groupId, userId });
            }
        } catch (err) {
            logger.error('Socket emit error:', err.message);
        }
    }

    async getUnreadCounts(userId) {
        // Total unread
        const totalUnread = await prisma.chatMessageUser.count({
            where: { receiverId: userId, isRead: false },
        });

        // Per-group unread
        const groupCounts = await prisma.chatMessageUser.groupBy({
            by: ['groupId'],
            where: { receiverId: userId, isRead: false },
            _count: { id: true },
        });

        const perGroup = {};
        for (const gc of groupCounts) {
            perGroup[gc.groupId] = gc._count.id;
        }

        return { totalUnread, perGroup };
    }

    // --- Link Preview ---
    async _extractLinkPreview(messageId, text) {
        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
        const urls = text.match(urlRegex);
        if (!urls || urls.length === 0) return;

        const url = urls[0]; // Only preview the first URL

        // Check cache
        const cached = linkPreviewCache.get(url);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            await prisma.chatMessage.update({
                where: { id: messageId },
                data: { linkPreview: cached.data },
            });
            this._emitLinkPreviewUpdate(messageId, cached.data);
            return;
        }

        try {
            const ogs = require('open-graph-scraper');
            const { result } = await ogs({ url, timeout: 5000 });

            if (result.success) {
                const preview = {
                    url,
                    title: result.ogTitle || result.dcTitle || '',
                    description: result.ogDescription || result.dcDescription || '',
                    image: result.ogImage?.[0]?.url || '',
                    siteName: result.ogSiteName || new URL(url).hostname,
                };

                // Cache it
                linkPreviewCache.set(url, { data: preview, timestamp: Date.now() });

                // Save to DB
                await prisma.chatMessage.update({
                    where: { id: messageId },
                    data: { linkPreview: preview },
                });

                this._emitLinkPreviewUpdate(messageId, preview);
            }
        } catch (err) {
            logger.error('Link preview fetch failed:', err.message);
        }
    }

    _emitLinkPreviewUpdate(messageId, preview) {
        try {
            const { getIO } = require('../socket');
            const io = getIO();
            if (io) {
                // We need the groupId, fetch it
                prisma.chatMessage.findUnique({
                    where: { id: messageId },
                    select: { groupId: true },
                }).then(msg => {
                    if (msg) {
                        io.to(`chat:${msg.groupId}`).emit('message:link-preview', {
                            messageId,
                            linkPreview: preview,
                        });
                    }
                });
            }
        } catch (err) {
            // ignore
        }
    }
}

module.exports = new ChatService();
