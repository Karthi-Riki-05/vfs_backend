const { prisma } = require("../../lib/prisma");
const logger = require("../../utils/logger");

function registerChatEvents(io, socket) {
  const userId = socket.userId;

  // Join all chat group rooms the user belongs to
  socket.on("chat:join-groups", async () => {
    try {
      const memberships = await prisma.chatGroupUser.findMany({
        where: { userId },
        select: { groupId: true },
      });
      const ownedGroups = await prisma.chatGroup.findMany({
        where: { userId },
        select: { id: true },
      });
      const groupIds = new Set([
        ...memberships.map((m) => m.groupId),
        ...ownedGroups.map((g) => g.id),
      ]);
      for (const groupId of groupIds) {
        socket.join(`chat:${groupId}`);
      }
      socket.emit("chat:joined-groups", { groupIds: Array.from(groupIds) });
    } catch (err) {
      logger.error("Failed to join chat groups:", err.message);
    }
  });

  // Join a SINGLE chat room on demand (B39/B43/B46). The client only joined
  // its rooms at connect, so a group created/joined afterwards — or simply
  // opening a conversation — never received live `message:new` /
  // `message:reaction` events until a full refresh. Opening a conversation
  // (and post-create/add-member) now calls this to join the room immediately.
  // Membership/ownership is verified so a client can't join arbitrary rooms.
  socket.on("chat:join-group", async (data) => {
    const groupId = (data && data.groupId) || null;
    if (!groupId) return;
    try {
      const [member, owner] = await Promise.all([
        prisma.chatGroupUser.findFirst({
          where: { groupId, userId },
          select: { id: true },
        }),
        prisma.chatGroup.findFirst({
          where: { id: groupId, userId },
          select: { id: true },
        }),
      ]);
      if (member || owner) {
        socket.join(`chat:${groupId}`);
        socket.emit("chat:joined-groups", { groupIds: [groupId] });
      }
    } catch (err) {
      logger.error("Failed to join chat group:", err.message);
    }
  });

  // Typing indicators
  socket.on("typing:start", (data) => {
    const { groupId } = data || {};
    if (!groupId) return;
    socket.to(`chat:${groupId}`).emit("typing:start", { groupId, userId });
  });

  socket.on("typing:stop", (data) => {
    const { groupId } = data || {};
    if (!groupId) return;
    socket.to(`chat:${groupId}`).emit("typing:stop", { groupId, userId });
  });

  // Mark messages as read (via socket for real-time read receipt updates)
  socket.on("message:mark-read", async (data) => {
    const { groupId } = data || {};
    if (!groupId) return;
    try {
      await prisma.chatMessageUser.updateMany({
        where: { groupId, receiverId: userId, isRead: false },
        data: { isRead: true },
      });

      // Update lastReadAt
      await prisma.chatGroupUser.updateMany({
        where: { groupId, userId },
        data: { lastReadAt: new Date() },
      });

      // Notify the group that this user has read messages
      socket.to(`chat:${groupId}`).emit("message:read", { groupId, userId });
    } catch (err) {
      logger.error("Failed to mark messages as read:", err.message);
    }
  });
}

module.exports = { registerChatEvents };
