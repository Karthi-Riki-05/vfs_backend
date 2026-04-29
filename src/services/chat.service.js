const { prisma } = require("../lib/prisma");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

// Simple in-memory link preview cache (URL -> preview data, expires after 1 hour)
const linkPreviewCache = new Map();
const CACHE_TTL = 60 * 60 * 1000;

class ChatService {
  async getChatGroups(userId, appContext = "free") {
    const groups = await prisma.chatGroup.findMany({
      where: {
        appContext,
        deletedAt: null,
        OR: [{ userId }, { members: { some: { userId } } }],
      },
      include: {
        _count: { select: { messages: true, members: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { message: true, createdAt: true, type: true },
        },
        members: {
          where: { userId },
          select: { lastReadAt: true },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Compute unread counts per group
    const groupsWithUnread = await Promise.all(
      groups.map(async (group) => {
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
      }),
    );

    return groupsWithUnread;
  }

  async createChatGroup(userId, data, appContext = "free") {
    // Build the unique member set up-front (creator + recipients, deduped)
    const memberIds = Array.from(
      new Set([
        userId,
        ...(data.memberIds || []).filter((id) => id && id !== userId),
      ]),
    );

    // ── DM dedup ───────────────────────────────────────────────────────
    // Only key dedup off an EXPLICIT `isDirect: true` from the caller —
    // otherwise a user creating a 2-person named group via the modal
    // would silently get an existing DM back. The contact-click flow
    // sets isDirect; the "+ Create" group flow does not.
    if (data.isDirect && !data.teamId && memberIds.length === 2) {
      const otherId = memberIds.find((id) => id !== userId);
      const candidates = await prisma.chatGroup.findMany({
        where: {
          deletedAt: null,
          teamId: null,
          AND: [
            { members: { some: { userId } } },
            { members: { some: { userId: otherId } } },
          ],
        },
        include: { members: { select: { userId: true } } },
      });
      const existing = candidates.find((g) => {
        const distinct = new Set(g.members.map((m) => m.userId));
        return (
          distinct.size === 2 && distinct.has(userId) && distinct.has(otherId)
        );
      });
      if (existing) {
        return existing;
      }
    }

    const isDmCreate =
      !!data.isDirect && !data.teamId && memberIds.length === 2;
    const group = await prisma.chatGroup.create({
      data: {
        // For DMs we store an empty title; display name is computed per-user
        // by getSidebarData. Named groups keep the supplied title; default to
        // "Group" if missing so the non-null column stays valid.
        title: isDmCreate ? "" : data.title?.trim() || "Group",
        userId,
        flowId: data.flowId || 0,
        flowItemId: data.flowItemId || "",
        appType: data.appType || null,
        appContext,
        teamId: data.teamId || null,
      },
    });

    // Add all members (creator + recipients) in one batch, skipping any
    // pre-existing rows defensively.
    await prisma.chatGroupUser.createMany({
      data: memberIds.map((id) => ({ userId: id, groupId: group.id })),
      skipDuplicates: true,
    });

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
      const isOwner = await prisma.chatGroup.findFirst({
        where: { id: groupId, userId },
      });
      if (!isOwner)
        throw new AppError("Not a member of this chat group", 403, "FORBIDDEN");
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
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          files: {
            select: {
              id: true,
              fileName: true,
              fileType: true,
              fileSize: true,
              filePath: true,
            },
          },
          msgUsers: {
            where: { receiverId: { not: undefined } },
            select: { receiverId: true, isRead: true },
          },
        },
      }),
      prisma.chatMessage.count({ where: whereClause }),
    ]);

    return {
      messages: messages.reverse(),
      total,
      page: Number(page) || 1,
      totalPages: Math.ceil(total / take),
    };
  }

  async sendMessage(groupId, userId, data) {
    // Verify membership
    const isMember = await prisma.chatGroupUser.findFirst({
      where: { groupId, userId },
    });
    const isOwner = !isMember
      ? await prisma.chatGroup.findFirst({ where: { id: groupId, userId } })
      : true;
    if (!isMember && !isOwner)
      throw new AppError("Not a member of this chat group", 403, "FORBIDDEN");

    const message = await prisma.chatMessage.create({
      data: {
        message: data.message,
        groupId,
        userId,
        type: data.type || "text",
        attachPath: data.attachPath || null,
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        files: true,
      },
    });

    // Update group timestamp
    await prisma.chatGroup.update({
      where: { id: groupId },
      data: { updatedAt: new Date() },
    });

    // Create read receipt entries for all other members
    const members = await prisma.chatGroupUser.findMany({
      where: { groupId, userId: { not: userId } },
    });

    if (members.length > 0) {
      await prisma.chatMessageUser.createMany({
        data: members.map((m) => ({
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
      const { getIO } = require("../socket");
      const io = getIO();
      if (io) {
        // Emit to the chat group room
        io.to(`chat:${groupId}`).emit("message:new", {
          ...message,
          groupId,
        });

        // Emit unread count update to each offline/other member
        for (const member of members) {
          const unreadCount = await prisma.chatMessageUser.count({
            where: { receiverId: member.userId, isRead: false },
          });
          io.to(`user:${member.userId}`).emit("notification:unread-count", {
            totalUnread: unreadCount,
            groupId,
          });
        }
      }
    } catch (err) {
      logger.error("Socket emit error:", err.message);
    }

    // Extract link preview asynchronously (don't block response)
    if (data.type === "text" || !data.type) {
      this._extractLinkPreview(message.id, data.message).catch((err) => {
        logger.error("Link preview error:", err.message);
      });
    }

    // Push notifications for OFFLINE members (best-effort, never blocks the
    // chat response). Online members already received the socket emit above.
    setImmediate(() =>
      this._notifyOfflineChatMembers({
        groupId,
        senderId: userId,
        members,
        messageType: data.type || "text",
        content: data.message,
      }).catch((err) => logger.warn(`[push] chat send failed: ${err.message}`)),
    );

    return message;
  }

  async _notifyOfflineChatMembers({
    groupId,
    senderId,
    members,
    messageType,
    content,
  }) {
    if (!Array.isArray(members) || members.length === 0) return;
    const userSocketMap = require("../socket/userSocketMap");
    const offlineUserIds = members
      .map((m) => m.userId)
      .filter((uid) => uid && !userSocketMap.isOnline(uid));
    if (offlineUserIds.length === 0) return;

    const [sender, group] = await Promise.all([
      prisma.user.findUnique({
        where: { id: senderId },
        select: { name: true },
      }),
      prisma.chatGroup.findUnique({
        where: { id: groupId },
        select: { name: true },
      }),
    ]);
    const senderFirstName = (sender?.name || "Someone").split(" ")[0];

    let preview;
    if (messageType === "image") {
      preview = `${senderFirstName} sent an image`;
    } else if (messageType !== "text") {
      preview = `${senderFirstName} sent a file`;
    } else {
      const text = (content || "").trim();
      preview = text.length > 50 ? `${text.slice(0, 50)}…` : text;
    }
    if (group?.name) preview = preview ? `${preview}` : preview;

    const push = require("./push.service");
    const notification = push.builders.newMessage({
      senderName: senderFirstName,
      preview,
      groupId,
    });
    if (group?.name) notification.title = `${senderFirstName} • ${group.name}`;
    await push.sendPushToMultipleUsers(offlineUserIds, notification);
  }

  async createFileMessage(groupId, userId, fileData) {
    // Verify membership
    const isMember = await prisma.chatGroupUser.findFirst({
      where: { groupId, userId },
    });
    const isOwner = !isMember
      ? await prisma.chatGroup.findFirst({ where: { id: groupId, userId } })
      : true;
    if (!isMember && !isOwner)
      throw new AppError("Not a member of this chat group", 403, "FORBIDDEN");

    const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(
      fileData.originalname,
    );
    const msgType = isImage ? "image" : "docs";

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
    await prisma.chatGroup.update({
      where: { id: groupId },
      data: { updatedAt: new Date() },
    });

    // Create read receipts
    const members = await prisma.chatGroupUser.findMany({
      where: { groupId, userId: { not: userId } },
    });
    if (members.length > 0) {
      await prisma.chatMessageUser.createMany({
        data: members.map((m) => ({
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
      const { getIO } = require("../socket");
      const io = getIO();
      if (io) {
        io.to(`chat:${groupId}`).emit("message:new", {
          ...fullMessage,
          groupId,
        });
        for (const member of members) {
          const unreadCount = await prisma.chatMessageUser.count({
            where: { receiverId: member.userId, isRead: false },
          });
          io.to(`user:${member.userId}`).emit("notification:unread-count", {
            totalUnread: unreadCount,
            groupId,
          });
        }
      }
    } catch (err) {
      logger.error("Socket emit error:", err.message);
    }

    // Push to offline members (file/image preview text built by the helper).
    setImmediate(() =>
      this._notifyOfflineChatMembers({
        groupId,
        senderId: userId,
        members,
        messageType: fullMessage?.type || "docs",
        content: fileData?.originalname || "",
      }).catch((err) =>
        logger.warn(`[push] chat file send failed: ${err.message}`),
      ),
    );

    return fullMessage;
  }

  async getFile(fileId, userId) {
    const file = await prisma.chatFile.findUnique({
      where: { id: fileId },
      include: { message: { select: { groupId: true } } },
    });
    if (!file) throw new AppError("File not found", 404, "NOT_FOUND");

    // Verify membership
    const groupId = file.message.groupId;
    const isMember = await prisma.chatGroupUser.findFirst({
      where: { groupId, userId },
    });
    const isOwner = !isMember
      ? await prisma.chatGroup.findFirst({ where: { id: groupId, userId } })
      : true;
    if (!isMember && !isOwner)
      throw new AppError("Access denied", 403, "FORBIDDEN");

    return file;
  }

  async addMember(groupId, userId, targetUserId) {
    // Verify requester is group creator
    const group = await prisma.chatGroup.findFirst({
      where: { id: groupId, userId },
    });
    if (!group)
      throw new AppError(
        "Chat group not found or not the creator",
        403,
        "FORBIDDEN",
      );

    // Check target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!targetUser) throw new AppError("User not found", 404, "NOT_FOUND");

    // Check not already a member
    const existing = await prisma.chatGroupUser.findFirst({
      where: { groupId, userId: targetUserId },
    });
    if (existing)
      throw new AppError("User is already a member", 409, "CONFLICT");

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
      const { getIO } = require("../socket");
      const io = getIO();
      if (io) {
        io.to(`chat:${groupId}`).emit("message:read", { groupId, userId });
      }
    } catch (err) {
      logger.error("Socket emit error:", err.message);
    }
  }

  async getUnreadCounts(userId) {
    // Total unread
    const totalUnread = await prisma.chatMessageUser.count({
      where: { receiverId: userId, isRead: false },
    });

    // Per-group unread
    const groupCounts = await prisma.chatMessageUser.groupBy({
      by: ["groupId"],
      where: { receiverId: userId, isRead: false },
      _count: { id: true },
    });

    const perGroup = {};
    for (const gc of groupCounts) {
      perGroup[gc.groupId] = gc._count.id;
    }

    return { totalUnread, perGroup };
  }

  async getSidebarData(userId, appContext = "free", activeTeamId = null) {
    // App-isolation: in Pro workspace, only Pro-context teams are visible.
    const appCtxFilter = appContext === "pro" ? { appContext: "pro" } : {};

    // No activeTeamId from the client → if the user OWNS a team in this
    // workspace, auto-resolve to it. Team owners don't switch contexts (they
    // don't appear in the header switcher per /users/team-context), so chat
    // must work for them out of the box. Only show the locked placeholder
    // when the user truly has no team at all in this workspace.
    if (!activeTeamId) {
      const ownedTeam = await prisma.team.findFirst({
        where: { teamOwnerId: userId, deletedAt: null, ...appCtxFilter },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (ownedTeam) {
        activeTeamId = ownedTeam.id;
      } else {
        return {
          teams: [],
          groups: [],
          contacts: [],
          allGroups: [],
          locked: true,
        };
      }
    }

    // TEAM CONTEXT → verify membership AND that the team belongs to the
    // current workspace. Pro app must reject Team-app teamIds and vice-versa.
    const [membership, ownedTeam] = await Promise.all([
      prisma.teamMember.findFirst({
        where: {
          teamId: activeTeamId,
          userId,
          team: { deletedAt: null, ...appCtxFilter },
        },
        select: { id: true },
      }),
      prisma.team.findFirst({
        where: {
          id: activeTeamId,
          teamOwnerId: userId,
          deletedAt: null,
          ...appCtxFilter,
        },
        select: { id: true },
      }),
    ]);
    if (!membership && !ownedTeam) {
      return {
        teams: [],
        groups: [],
        contacts: [],
        allGroups: [],
        locked: true,
      };
    }

    // 1. Fetch ONLY the active team.
    const teams = await prisma.team.findMany({
      where: {
        id: activeTeamId,
        deletedAt: null,
      },
      include: {
        owner: { select: { id: true, name: true, email: true, image: true } },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // 2. Fetch chat groups belonging to this team only (the user must also
    // be a member of the chat group to see it — preserves per-group ACLs).
    const chatGroups = await prisma.chatGroup.findMany({
      where: {
        deletedAt: null,
        teamId: activeTeamId,
        OR: [{ userId }, { members: { some: { userId } } }],
      },
      include: {
        _count: { select: { messages: true, members: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { message: true, createdAt: true, type: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // 3. Batch unread counts
    const unreadCounts = await prisma.chatMessageUser.groupBy({
      by: ["groupId"],
      where: { receiverId: userId, isRead: false },
      _count: { id: true },
    });
    const unreadMap = {};
    for (const uc of unreadCounts) {
      unreadMap[uc.groupId] = uc._count.id;
    }

    // 4. Classify groups: team-linked vs DM vs named group
    //
    // STRUCTURAL DM detection (no longer relies on title === other.name):
    //   teamId IS NULL && distinct membership ⊆ {self, otherUser} (size ≤ 2)
    //
    // For each DM we compute a per-user displayName/displayImage taken from
    // the OTHER member, so the recipient never sees their own name as the
    // group title. Named non-team group chats keep their original title.
    const teamConvoMap = {}; // teamId -> chatGroup
    const regularGroups = []; // Named non-team groups (NOT DMs)
    const dmGroups = []; // 1-on-1 DM groups (used to link contacts)

    for (const group of chatGroups) {
      // Dedupe member rows defensively — old data may have duplicates.
      const distinctMembers = [];
      const seenMemberIds = new Set();
      for (const m of group.members) {
        if (m.user && !seenMemberIds.has(m.user.id)) {
          seenMemberIds.add(m.user.id);
          distinctMembers.push(m.user);
        }
      }

      const g = {
        ...group,
        unreadCount: unreadMap[group.id] || 0,
        members: distinctMembers,
        memberCount: distinctMembers.length,
      };

      if (group.teamId) {
        teamConvoMap[group.teamId] = g;
        continue;
      }

      // A group is a DM when:
      //   • it has no explicit title, OR
      //   • the title exactly matches one of the members' name/email
      //     (legacy DMs were created with the recipient's name as title)
      // AND it has ≤2 distinct members.
      const rawTitle = (group.title || "").trim();
      const hasMeaningfulTitle = !!rawTitle;
      const titleLooksLikeMemberName =
        hasMeaningfulTitle &&
        distinctMembers.some(
          (m) => m.name === rawTitle || m.email === rawTitle,
        );
      const isDm =
        (!hasMeaningfulTitle || titleLooksLikeMemberName) &&
        distinctMembers.length <= 2 &&
        distinctMembers.some((m) => m.id !== userId);

      if (isDm) {
        const otherMember =
          distinctMembers.find((m) => m.id !== userId) || null;
        g.isDirect = true;
        g.displayName =
          otherMember?.name || otherMember?.email || "Direct Message";
        g.displayImage = otherMember?.image || null;
        g.otherUserId = otherMember?.id || null;
        dmGroups.push(g);
      } else {
        g.isDirect = false;
        g.displayName = group.title || "Group";
        g.displayImage = null;
        regularGroups.push(g);
      }
    }

    // 5. Build teams response with conversation links
    const teamsWithConvo = teams.map((team) => ({
      id: team.id,
      name: team.name,
      description: team.description,
      ownerId: team.teamOwnerId,
      ownerName: team.owner?.name,
      memberCount: team._count.members,
      members: team.members.map((m) => m.user),
      conversationId: teamConvoMap[team.id]?.id || null,
      lastMessage: teamConvoMap[team.id]?.messages?.[0] || null,
      unreadCount: teamConvoMap[team.id]?.unreadCount || 0,
    }));

    // 6. Build contacts: deduplicated users from teams + ALL chat groups
    const contactMap = new Map();
    for (const team of teams) {
      for (const member of team.members) {
        if (member.user && member.user.id !== userId) {
          contactMap.set(member.user.id, member.user);
        }
      }
    }
    for (const group of chatGroups) {
      for (const member of group.members) {
        if (member.user && member.user.id !== userId) {
          contactMap.set(member.user.id, member.user);
        }
      }
    }

    // Find existing 1:1 conversations for each contact. If duplicates exist
    // (legacy data), prefer the one with the most recent activity.
    const contacts = [];
    for (const [contactId, contactUser] of contactMap) {
      const matches = dmGroups.filter((g) =>
        g.members.some((m) => m.id === contactId),
      );
      const existingConvo = matches.sort((a, b) => {
        const ta = new Date(
          a.messages?.[0]?.createdAt || a.updatedAt || 0,
        ).getTime();
        const tb = new Date(
          b.messages?.[0]?.createdAt || b.updatedAt || 0,
        ).getTime();
        return tb - ta;
      })[0];
      contacts.push({
        ...contactUser,
        conversationId: existingConvo?.id || null,
        lastMessage: existingConvo?.messages?.[0] || null,
        unreadCount: existingConvo?.unreadCount || 0,
      });
    }

    return {
      teams: teamsWithConvo,
      groups: regularGroups,
      contacts,
      // Flat list for backward compat — now also carries per-user display
      // metadata so the frontend never has to compute it.
      allGroups: chatGroups.map((g) => {
        const distinctMembers = [];
        const seen = new Set();
        for (const m of g.members) {
          if (m.user && !seen.has(m.user.id)) {
            seen.add(m.user.id);
            distinctMembers.push(m.user);
          }
        }
        const rawTitle = (g.title || "").trim();
        const hasMeaningfulTitle = !!rawTitle;
        const titleLooksLikeMemberName =
          hasMeaningfulTitle &&
          distinctMembers.some(
            (m) => m.name === rawTitle || m.email === rawTitle,
          );
        const isDm =
          !g.teamId &&
          (!hasMeaningfulTitle || titleLooksLikeMemberName) &&
          distinctMembers.length <= 2 &&
          distinctMembers.some((m) => m.id !== userId);
        const otherMember = isDm
          ? distinctMembers.find((m) => m.id !== userId)
          : null;
        return {
          ...g,
          unreadCount: unreadMap[g.id] || 0,
          members: distinctMembers,
          memberCount: distinctMembers.length,
          isDirect: isDm,
          displayName: isDm
            ? otherMember?.name || otherMember?.email || "Direct Message"
            : g.title || "Group",
          displayImage: isDm ? otherMember?.image || null : null,
          otherUserId: isDm ? otherMember?.id || null : null,
        };
      }),
    };
  }

  async getGroupInfo(groupId, userId) {
    // Verify membership
    const isMember = await prisma.chatGroupUser.findFirst({
      where: { groupId, userId },
    });
    const group = await prisma.chatGroup.findUnique({
      where: { id: groupId },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { members: true } },
      },
    });
    if (!group) throw new AppError("Group not found", 404, "NOT_FOUND");
    if (!isMember && group.userId !== userId)
      throw new AppError("Not a member", 403, "FORBIDDEN");

    return {
      id: group.id,
      title: group.title,
      createdBy: group.user,
      createdAt: group.createdAt,
      memberCount: group._count.members,
      isAdmin: group.userId === userId,
      members: group.members.map((m) => ({
        ...m.user,
        role: m.userId === group.userId ? "admin" : "member",
        joinedAt: m.createdAt,
      })),
    };
  }

  async updateGroup(groupId, userId, data) {
    const group = await prisma.chatGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new AppError("Group not found", 404, "NOT_FOUND");
    if (group.userId !== userId)
      throw new AppError("Only the group creator can update", 403, "FORBIDDEN");

    return await prisma.chatGroup.update({
      where: { id: groupId },
      data: { title: data.title },
    });
  }

  async getAvailableMembers(groupId, userId, appContext = "free") {
    // Verify membership
    const isMember = await prisma.chatGroupUser.findFirst({
      where: { groupId, userId },
    });
    const isOwner = !isMember
      ? await prisma.chatGroup.findFirst({ where: { id: groupId, userId } })
      : true;
    if (!isMember && !isOwner)
      throw new AppError("Not a member of this group", 403, "FORBIDDEN");

    // Get current group member IDs
    const currentMembers = await prisma.chatGroupUser.findMany({
      where: { groupId },
      select: { userId: true },
    });
    const currentMemberIds = new Set(currentMembers.map((m) => m.userId));

    // Get all teams the user belongs to (any appContext — free members of
    // team-plan teams must still see those team members here).
    const teams = await prisma.team.findMany({
      where: {
        deletedAt: null,
        OR: [{ teamOwnerId: userId }, { members: { some: { userId } } }],
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // Group members by team, marking who's already in the group
    const teamGroups = teams
      .map((team) => ({
        teamId: team.id,
        teamName: team.name,
        members: team.members
          .filter((m) => m.userId !== userId) // Exclude current user
          .map((m) => ({
            userId: m.user.id,
            name: m.user.name || m.user.email,
            email: m.user.email,
            avatar: m.user.image,
            alreadyInGroup: currentMemberIds.has(m.userId),
          })),
      }))
      .filter((t) => t.members.length > 0);

    return teamGroups;
  }

  async addMembers(groupId, userId, userIds, appContext = "free") {
    // Verify group exists
    const group = await prisma.chatGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new AppError("Group not found", 404, "NOT_FOUND");

    // Verify requester is a member
    const isMember = await prisma.chatGroupUser.findFirst({
      where: { groupId, userId },
    });
    if (!isMember && group.userId !== userId)
      throw new AppError("Not a member", 403, "FORBIDDEN");

    // Verify all userIds are from user's teams (security) — across contexts.
    const teams = await prisma.team.findMany({
      where: {
        deletedAt: null,
        OR: [{ teamOwnerId: userId }, { members: { some: { userId } } }],
      },
      include: { members: { select: { userId: true } } },
    });
    const validTeamMemberIds = new Set();
    for (const team of teams) {
      for (const m of team.members) validTeamMemberIds.add(m.userId);
    }

    // Get current members
    const currentMembers = await prisma.chatGroupUser.findMany({
      where: { groupId },
      select: { userId: true },
    });
    const currentMemberIds = new Set(currentMembers.map((m) => m.userId));

    const addedNames = [];
    for (const addUserId of userIds) {
      if (!validTeamMemberIds.has(addUserId)) continue;
      if (currentMemberIds.has(addUserId)) continue;

      await prisma.chatGroupUser.create({
        data: { groupId, userId: addUserId },
      });

      const addedUser = await prisma.user.findUnique({
        where: { id: addUserId },
        select: { name: true, email: true },
      });
      addedNames.push(addedUser?.name || addedUser?.email || "Someone");
    }

    // System message
    if (addedNames.length > 0) {
      const adder = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });
      const adderName = adder?.name || adder?.email;
      const sysMsg = await prisma.chatMessage.create({
        data: {
          message: `${adderName} added ${addedNames.join(", ")} to the group`,
          groupId,
          userId,
          type: "text",
        },
      });

      await prisma.chatGroup.update({
        where: { id: groupId },
        data: { updatedAt: new Date() },
      });

      // Emit via socket
      try {
        const { getIO } = require("../socket");
        const io = getIO();
        if (io) {
          io.to(`chat:${groupId}`).emit("message:new", { ...sysMsg, groupId });
        }
      } catch (err) {
        logger.error("Socket emit error:", err.message);
      }
    }

    return { addedCount: addedNames.length, addedNames };
  }

  async removeMember(groupId, userId, removeUserId) {
    const group = await prisma.chatGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new AppError("Group not found", 404, "NOT_FOUND");
    if (group.userId !== userId)
      throw new AppError(
        "Only the group creator can remove members",
        403,
        "FORBIDDEN",
      );
    if (removeUserId === userId)
      throw new AppError(
        "Cannot remove yourself. Use Leave Group instead.",
        400,
        "BAD_REQUEST",
      );

    const membership = await prisma.chatGroupUser.findFirst({
      where: { groupId, userId: removeUserId },
    });
    if (!membership)
      throw new AppError("User is not a member", 404, "NOT_FOUND");

    await prisma.chatGroupUser.delete({ where: { id: membership.id } });

    // System message
    const removedUser = await prisma.user.findUnique({
      where: { id: removeUserId },
      select: { name: true, email: true },
    });
    const adminUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const sysMsg = await prisma.chatMessage.create({
      data: {
        message: `${adminUser?.name || adminUser?.email} removed ${removedUser?.name || removedUser?.email} from the group`,
        groupId,
        userId,
        type: "text",
      },
    });

    try {
      const { getIO } = require("../socket");
      const io = getIO();
      if (io) {
        io.to(`chat:${groupId}`).emit("message:new", { ...sysMsg, groupId });
      }
    } catch (err) {
      logger.error("Socket emit error:", err.message);
    }

    return { success: true };
  }

  async leaveGroup(groupId, userId) {
    const group = await prisma.chatGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new AppError("Group not found", 404, "NOT_FOUND");

    const membership = await prisma.chatGroupUser.findFirst({
      where: { groupId, userId },
    });
    if (!membership)
      throw new AppError("Not a member of this group", 403, "FORBIDDEN");

    await prisma.chatGroupUser.delete({ where: { id: membership.id } });

    // System message
    const leaver = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const sysMsg = await prisma.chatMessage.create({
      data: {
        message: `${leaver?.name || leaver?.email} left the group`,
        groupId,
        userId,
        type: "text",
      },
    });

    try {
      const { getIO } = require("../socket");
      const io = getIO();
      if (io) {
        io.to(`chat:${groupId}`).emit("message:new", { ...sysMsg, groupId });
      }
    } catch (err) {
      logger.error("Socket emit error:", err.message);
    }

    return { success: true };
  }

  async deleteGroup(groupId, userId) {
    const group = await prisma.chatGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new AppError("Group not found", 404, "NOT_FOUND");
    if (group.userId !== userId)
      throw new AppError("Only the group creator can delete", 403, "FORBIDDEN");

    // Soft delete
    await prisma.chatGroup.update({
      where: { id: groupId },
      data: { deletedAt: new Date() },
    });

    try {
      const { getIO } = require("../socket");
      const io = getIO();
      if (io) {
        io.to(`chat:${groupId}`).emit("group:deleted", { groupId });
      }
    } catch (err) {
      logger.error("Socket emit error:", err.message);
    }

    return { success: true };
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
      const ogs = require("open-graph-scraper");
      const { result } = await ogs({ url, timeout: 5000 });

      if (result.success) {
        const preview = {
          url,
          title: result.ogTitle || result.dcTitle || "",
          description: result.ogDescription || result.dcDescription || "",
          image: result.ogImage?.[0]?.url || "",
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
      logger.error("Link preview fetch failed:", err.message);
    }
  }

  _emitLinkPreviewUpdate(messageId, preview) {
    try {
      const { getIO } = require("../socket");
      const io = getIO();
      if (io) {
        // We need the groupId, fetch it
        prisma.chatMessage
          .findUnique({
            where: { id: messageId },
            select: { groupId: true },
          })
          .then((msg) => {
            if (msg) {
              io.to(`chat:${msg.groupId}`).emit("message:link-preview", {
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
