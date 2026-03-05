const { prisma } = require('../../lib/prisma');
const userSocketMap = require('../userSocketMap');
const logger = require('../../utils/logger');

function registerPresenceEvents(io, socket) {
    const userId = socket.userId;

    // Mark user online
    userSocketMap.addSocket(userId, socket.id);

    // Join personal room for targeted events
    socket.join(`user:${userId}`);

    // Broadcast online status to all connected clients
    socket.broadcast.emit('user:online', { userId });

    // Handle explicit presence request (get online status of specific users)
    socket.on('presence:request', (data) => {
        const { userIds } = data || {};
        if (!Array.isArray(userIds)) return;
        const statuses = {};
        for (const uid of userIds) {
            statuses[uid] = userSocketMap.isOnline(uid);
        }
        socket.emit('presence:response', { statuses });
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
        const isFullyOffline = userSocketMap.removeSocket(userId, socket.id);
        if (isFullyOffline) {
            // Save lastSeen to database
            try {
                await prisma.user.update({
                    where: { id: userId },
                    data: { lastSeen: new Date() },
                });
            } catch (err) {
                logger.error('Failed to update lastSeen:', err.message);
            }

            // Broadcast offline status
            socket.broadcast.emit('user:offline', { userId, lastSeen: new Date().toISOString() });
        }
    });
}

module.exports = { registerPresenceEvents };
