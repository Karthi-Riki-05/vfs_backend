const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { registerPresenceEvents } = require('./events/presenceEvents');
const { registerChatEvents } = require('./events/chatEvents');

let io = null;

function initSocketIO(httpServer, allowedOrigins) {
    io = new Server(httpServer, {
        cors: {
            origin: allowedOrigins,
            methods: ['GET', 'POST'],
            credentials: true,
        },
        pingInterval: 25000,
        pingTimeout: 20000,
    });

    // JWT authentication middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            return next(new Error('Authentication required'));
        }

        const secret = process.env.NEXTAUTH_SECRET;
        if (!secret) {
            return next(new Error('Server configuration error'));
        }

        try {
            const decoded = jwt.verify(token, secret);
            socket.userId = decoded.sub || decoded.id;
            if (!socket.userId) {
                return next(new Error('Invalid token: no user ID'));
            }
            next();
        } catch (err) {
            return next(new Error('Invalid or expired token'));
        }
    });

    // Connection handler
    io.on('connection', (socket) => {
        logger.info(`Socket connected: ${socket.id} (user: ${socket.userId})`);

        registerPresenceEvents(io, socket);
        registerChatEvents(io, socket);

        socket.on('disconnect', (reason) => {
            logger.info(`Socket disconnected: ${socket.id} (reason: ${reason})`);
        });

        socket.on('error', (err) => {
            logger.error(`Socket error: ${socket.id}`, err.message);
        });
    });

    logger.info('Socket.IO initialized');
    return io;
}

function getIO() {
    return io;
}

module.exports = { initSocketIO, getIO };
