/**
 * In-memory map of userId -> Set<socketId>
 * Tracks which sockets belong to which user (supports multiple tabs/devices).
 */

const userSockets = new Map(); // userId -> Set<socketId>

function addSocket(userId, socketId) {
    if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socketId);
}

function removeSocket(userId, socketId) {
    const sockets = userSockets.get(userId);
    if (!sockets) return false;
    sockets.delete(socketId);
    if (sockets.size === 0) {
        userSockets.delete(userId);
        return true; // user fully offline
    }
    return false;
}

function isOnline(userId) {
    const sockets = userSockets.get(userId);
    return sockets ? sockets.size > 0 : false;
}

function getSocketIds(userId) {
    return userSockets.get(userId) || new Set();
}

function getOnlineUserIds() {
    return Array.from(userSockets.keys());
}

module.exports = {
    addSocket,
    removeSocket,
    isOnline,
    getSocketIds,
    getOnlineUserIds,
};
