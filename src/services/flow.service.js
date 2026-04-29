const { prisma } = require("../lib/prisma");
const produce = require("immer").produce;
const AppError = require("../utils/AppError");

class FlowService {
  async getAllFlows(userId, options = {}, appContext = "free") {
    const { search, page = 1, limit = 10, nonEmpty, teamId } = options;
    const take = Math.min(Number(limit) || 10, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    // Workspace semantics (Slack-style):
    //   • Personal context (teamId omitted) → show ONLY flows where
    //     ownerId = user AND teamId IS NULL.
    //   • Team context (teamId set) → caller must be a verified member
    //     (or owner) of that team. Show ALL flows with teamId = that team,
    //     regardless of which member created them — that's the "team
    //     workspace" view. If the user has no access to the team, we
    //     return an empty page rather than 403 to keep the UX soft.
    let where;
    if (teamId) {
      const [membership, ownedTeam] = await Promise.all([
        prisma.teamMember.findFirst({
          where: { teamId, userId },
          select: { id: true },
        }),
        prisma.team.findFirst({
          where: { id: teamId, teamOwnerId: userId },
          select: { id: true },
        }),
      ]);
      if (!membership && !ownedTeam) {
        return {
          flows: [],
          total: 0,
          page: Number(page) || 1,
          totalPages: 0,
        };
      }
      where = { teamId, deletedAt: null };
    } else {
      where = { ownerId: userId, teamId: null, deletedAt: null, appContext };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    // Filter to non-empty flows only (has real diagram data)
    if (nonEmpty === "true") {
      where.diagramData = {
        not: {
          in: ["", "{}", "<mxGraphModel></mxGraphModel>", "<mxGraphModel/>"],
        },
      };
    }

    const [flows, total] = await Promise.all([
      prisma.flow.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: "desc" },
        include: {
          project: {
            select: { id: true, name: true },
          },
          _count: {
            select: { flowShares: true },
          },
        },
      }),
      prisma.flow.count({ where }),
    ]);

    // Flatten project name and share count onto flow objects
    const flowsWithProject = flows.map((f) => ({
      ...f,
      projectName: f.project?.name || null,
      project: undefined,
      shareCount: f._count?.flowShares || 0,
      _count: undefined,
      accessType: "owner",
    }));

    return {
      flows: flowsWithProject,
      total,
      page: Number(page) || 1,
      totalPages: Math.ceil(total / take),
    };
  }

  async getFlowById(id, userId) {
    return await prisma.flow.findFirst({
      where: { id, ownerId: userId },
    });
  }

  async createFlow(userId, data, appContext = "free") {
    const teamId = data.teamId || null;

    // Workspace-scoped flow-limit enforcement:
    //   • Team context → count team flows, limit comes from TEAM OWNER's
    //     plan. Caller must be a verified member.
    //   • Personal context → count the caller's personal (teamId=null)
    //     flows against their own plan.
    if (teamId) {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        include: {
          owner: {
            select: {
              id: true,
              proUnlimitedFlows: true,
              proFlowLimit: true,
            },
          },
        },
      });
      if (!team || team.deletedAt) {
        throw new AppError("Team not found", 404, "NOT_FOUND");
      }
      const [membership, isOwner] = await Promise.all([
        prisma.teamMember.findFirst({
          where: { teamId, userId },
          select: { id: true },
        }),
        Promise.resolve(team.teamOwnerId === userId),
      ]);
      if (!membership && !isOwner) {
        throw new AppError(
          "You are not a member of this team",
          403,
          "FORBIDDEN",
        );
      }
      if (!team.owner.proUnlimitedFlows) {
        const limit = team.owner.proFlowLimit || 10;
        const count = await prisma.flow.count({
          where: { teamId, deletedAt: null },
        });
        if (count >= limit) {
          throw new AppError(
            `Team flow limit reached (${limit}). Upgrade the team plan to create more flows.`,
            403,
            "FLOW_LIMIT_REACHED",
          );
        }
      }
    } else {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          hasPro: true,
          proUnlimitedFlows: true,
          proFlowLimit: true,
        },
      });
      if (user && !user.proUnlimitedFlows) {
        const limit = user.proFlowLimit || 10;
        const count = await prisma.flow.count({
          where: {
            ownerId: userId,
            teamId: null,
            deletedAt: null,
            appContext,
          },
        });
        if (count >= limit) {
          throw new AppError(
            `Flow limit reached (${limit}). Upgrade to create more flows.`,
            403,
            "FLOW_LIMIT_REACHED",
          );
        }
      }
    }

    return await prisma.flow.create({
      data: {
        name: data.name,
        description: data.description,
        thumbnail: data.thumbnail,
        diagramData: data.xml || data.diagramData || "",
        isPublic: data.isPublic || false,
        ownerId: userId,
        projectId: data.projectId || null,
        teamId,
        // Flows created in a team context use appContext='team' so the
        // workspace UI can filter consistently; personal flows keep the
        // user's currentVersion.
        appContext: teamId ? "team" : appContext,
      },
    });
  }

  async updateFlow(id, userId, data) {
    const flow = await prisma.flow.findFirst({
      where: { id, ownerId: userId, deletedAt: null },
    });
    if (!flow) throw new AppError("Flow not found", 404, "NOT_FOUND");

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.thumbnail !== undefined) updateData.thumbnail = data.thumbnail;
    if (data.isPublic !== undefined) updateData.isPublic = data.isPublic;
    if (data.isFavorite !== undefined) updateData.isFavorite = data.isFavorite;
    if (data.projectId !== undefined) updateData.projectId = data.projectId;
    if (data.xml !== undefined) updateData.diagramData = data.xml;
    if (data.diagramData !== undefined)
      updateData.diagramData = data.diagramData;

    const updated = await prisma.flow.update({
      where: { id },
      data: updateData,
    });

    // Create a version snapshot whenever diagramData changes
    if (
      updateData.diagramData !== undefined &&
      updateData.diagramData &&
      updateData.diagramData !== flow.diagramData
    ) {
      try {
        await prisma.flowVersion.create({
          data: {
            flowId: id,
            xml: updateData.diagramData,
            savedById: userId,
            thumbnail: data.thumbnail || null,
          },
        });
        const all = await prisma.flowVersion.findMany({
          where: { flowId: id },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (all.length > 20) {
          const oldIds = all.slice(20).map((v) => v.id);
          await prisma.flowVersion.deleteMany({
            where: { id: { in: oldIds } },
          });
        }
      } catch (e) {
        console.error("FlowVersion snapshot failed:", e.message);
      }
    }

    return updated;
  }

  async deleteFlow(id, userId) {
    const flow = await prisma.flow.findFirst({
      where: { id, ownerId: userId, deletedAt: null },
    });
    if (!flow) throw new AppError("Flow not found", 404, "NOT_FOUND");

    return await prisma.flow.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async getTrash(userId, options = {}, appContext = "free") {
    const { page = 1, limit = 20 } = options;
    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const where = { ownerId: userId, deletedAt: { not: null }, appContext };
    const [flows, total] = await Promise.all([
      prisma.flow.findMany({
        where,
        skip,
        take,
        orderBy: { deletedAt: "desc" },
      }),
      prisma.flow.count({ where }),
    ]);

    return {
      flows,
      total,
      page: Number(page) || 1,
      totalPages: Math.ceil(total / take),
    };
  }

  async restoreFlow(id, userId) {
    const result = await prisma.flow.updateMany({
      where: { id, ownerId: userId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    if (result.count === 0)
      throw new AppError("Flow not found in trash", 404, "NOT_FOUND");
    return result;
  }

  async permanentDeleteFlow(id, userId) {
    const result = await prisma.flow.deleteMany({
      where: { id, ownerId: userId, deletedAt: { not: null } },
    });
    if (result.count === 0)
      throw new AppError("Flow not found in trash", 404, "NOT_FOUND");
    return result;
  }

  async purgeOldTrash(daysOld = 30) {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    return await prisma.flow.deleteMany({
      where: { deletedAt: { not: null, lt: cutoff } },
    });
  }

  async getFavorites(userId, appContext = "free") {
    return await prisma.flow.findMany({
      where: { ownerId: userId, isFavorite: true, deletedAt: null, appContext },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, thumbnail: true },
    });
  }

  async duplicateFlow(id, userId, appContext = "free") {
    const original = await this.getFlowById(id, userId);
    if (!original) throw new AppError("Flow not found", 404, "NOT_FOUND");

    // Route through createFlow so the flow-limit check applies — otherwise
    // users could bypass the cap by duplicating existing flows.
    return await this.createFlow(
      userId,
      {
        name: `${original.name} (Copy)`,
        description: original.description,
        thumbnail: original.thumbnail,
        diagramData: original.diagramData,
        isPublic: original.isPublic,
      },
      appContext,
    );
  }

  // ==================== SHARING ====================

  async shareFlow(flowId, userId, shares, appContext = "free") {
    // Verify flow belongs to current user
    const flow = await prisma.flow.findFirst({
      where: { id: flowId, ownerId: userId, deletedAt: null, appContext },
    });
    if (!flow)
      throw new AppError(
        "Flow not found or not owned by you",
        404,
        "NOT_FOUND",
      );

    // Get valid team member IDs
    const teamMembers = await prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const teamIds = teamMembers.map((tm) => tm.teamId);

    const validMembers = await prisma.teamMember.findMany({
      where: { teamId: { in: teamIds }, userId: { not: userId } },
      select: { userId: true },
    });
    const validIds = new Set(validMembers.map((m) => m.userId));

    const results = [];
    for (const share of shares) {
      if (!validIds.has(share.userId)) {
        results.push({
          userId: share.userId,
          error: "User is not a team member",
        });
        continue;
      }
      if (share.userId === userId) {
        results.push({
          userId: share.userId,
          error: "Cannot share with yourself",
        });
        continue;
      }
      try {
        await prisma.flowShare.upsert({
          where: {
            flowId_sharedWithId: { flowId, sharedWithId: share.userId },
          },
          create: {
            flowId,
            sharedById: userId,
            sharedWithId: share.userId,
            permission: share.permission,
            appContext,
          },
          update: { permission: share.permission },
        });
        results.push({
          userId: share.userId,
          permission: share.permission,
          success: true,
        });
        // FCM push notification — never break share on failure
        try {
          const sharer = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true },
          });
          const fcm = require("./fcm.service");
          await fcm.sendToUser(
            share.userId,
            "Flow Shared With You",
            `${sharer && sharer.name ? sharer.name : "Someone"} shared "${flow.name}" with you`,
            { type: "flow_share", flowId },
          );
        } catch (fcmErr) {
          console.error("[FCM share notify] failed:", fcmErr.message);
        }
      } catch (err) {
        results.push({ userId: share.userId, error: err.message });
      }
    }
    return results;
  }

  async getFlowShares(flowId, userId) {
    // Verify user is owner or has access
    const flow = await prisma.flow.findFirst({
      where: { id: flowId, deletedAt: null },
    });
    if (!flow) throw new AppError("Flow not found", 404, "NOT_FOUND");

    if (flow.ownerId !== userId) {
      const share = await prisma.flowShare.findFirst({
        where: { flowId, sharedWithId: userId },
      });
      if (!share) throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return await prisma.flowShare.findMany({
      where: { flowId },
      include: {
        sharedWith: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateShare(flowId, shareId, userId, permission) {
    const flow = await prisma.flow.findFirst({
      where: { id: flowId, ownerId: userId, deletedAt: null },
    });
    if (!flow)
      throw new AppError(
        "Only the flow owner can change permissions",
        403,
        "FORBIDDEN",
      );

    const share = await prisma.flowShare.findFirst({
      where: { id: shareId, flowId },
    });
    if (!share) throw new AppError("Share not found", 404, "NOT_FOUND");

    return await prisma.flowShare.update({
      where: { id: shareId },
      data: { permission },
    });
  }

  async removeShare(flowId, shareId, userId) {
    const share = await prisma.flowShare.findFirst({
      where: { id: shareId, flowId },
    });
    if (!share) throw new AppError("Share not found", 404, "NOT_FOUND");

    const flow = await prisma.flow.findFirst({ where: { id: flowId } });
    if (flow.ownerId !== userId && share.sharedWithId !== userId) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    return await prisma.flowShare.delete({ where: { id: shareId } });
  }

  async getAvailableShareMembers(userId) {
    // Get all team members across all user's teams (deduplicated)
    const teamMembers = await prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const teamIds = teamMembers.map((tm) => tm.teamId);

    if (teamIds.length === 0) return [];

    const members = await prisma.teamMember.findMany({
      where: { teamId: { in: teamIds }, userId: { not: userId } },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    // Deduplicate by user ID
    const seen = new Set();
    const unique = [];
    for (const m of members) {
      if (!seen.has(m.userId)) {
        seen.add(m.userId);
        unique.push(m.user);
      }
    }
    return unique;
  }

  async getSharedFlows(userId, _appContext = "free", activeTeamId = null) {
    // "Shared with me" is a TEAM-context feature. Personal accounts don't
    // see any incoming shares — sharing is strictly for team workspaces.
    if (!activeTeamId) return [];

    // A share is visible in Team X's workspace ONLY if the sharer is Team
    // X's owner (the team owner is the person authorised to distribute
    // flows inside their team). Shares originated by members of other
    // teams stay scoped to THOSE teams and never cross-leak here.
    const team = await prisma.team.findFirst({
      where: { id: activeTeamId, deletedAt: null },
      select: { teamOwnerId: true },
    });
    if (!team) return [];

    const shares = await prisma.flowShare.findMany({
      where: {
        sharedWithId: userId,
        sharedById: team.teamOwnerId,
        flow: { deletedAt: null },
      },
      include: {
        flow: {
          include: {
            project: { select: { id: true, name: true } },
          },
        },
        sharedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return shares
      .filter((s) => s.flow && !s.flow.deletedAt)
      .map((s) => ({
        ...s.flow,
        projectName: s.flow.project?.name || null,
        project: undefined,
        accessType: s.permission,
        sharedByName: s.sharedBy?.name || s.sharedBy?.email || "Unknown",
        sharedByEmail: s.sharedBy?.email || null,
        shareId: s.id,
      }));
  }

  async getFlowByIdWithAccess(id, userId) {
    const flow = await prisma.flow.findFirst({
      where: { id, deletedAt: null },
    });
    if (!flow) return null;

    // Owner
    if (flow.ownerId === userId) {
      return { ...flow, permission: "owner" };
    }

    // Shared user
    const share = await prisma.flowShare.findFirst({
      where: { flowId: id, sharedWithId: userId },
    });
    if (share) {
      return { ...flow, permission: share.permission };
    }

    // Super admin — read-only access for support / audit. Writes are still
    // blocked by updateFlowWithAccess / deleteFlow because those check
    // ownerId directly.
    const requester = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (requester?.role === "super_admin") {
      return { ...flow, permission: "admin_view" };
    }

    return null;
  }

  async updateFlowWithAccess(id, userId, data) {
    const flow = await prisma.flow.findFirst({
      where: { id, deletedAt: null },
    });
    if (!flow) throw new AppError("Flow not found", 404, "NOT_FOUND");

    // Owner can always edit
    if (flow.ownerId === userId) {
      return await this.updateFlow(id, userId, data);
    }

    // Check shared edit permission
    const share = await prisma.flowShare.findFirst({
      where: { flowId: id, sharedWithId: userId, permission: "edit" },
    });
    if (!share)
      throw new AppError(
        "You have view-only access to this flow",
        403,
        "FORBIDDEN",
      );

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.thumbnail !== undefined) updateData.thumbnail = data.thumbnail;
    if (data.xml !== undefined) updateData.diagramData = data.xml;
    if (data.diagramData !== undefined)
      updateData.diagramData = data.diagramData;

    const updated = await prisma.flow.update({
      where: { id },
      data: updateData,
    });

    // Capture a version snapshot for shared-edit saves, exactly like
    // updateFlow does on the owner path. Without this, edits by team
    // members never appeared in the version-history drawer, so "who
    // changed what, when" was unanswerable for collaborative flows.
    if (
      updateData.diagramData !== undefined &&
      updateData.diagramData &&
      updateData.diagramData !== flow.diagramData
    ) {
      try {
        await prisma.flowVersion.create({
          data: {
            flowId: id,
            xml: updateData.diagramData,
            savedById: userId, // records the ACTING user, not the owner
            thumbnail: data.thumbnail || null,
          },
        });
        const all = await prisma.flowVersion.findMany({
          where: { flowId: id },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (all.length > 20) {
          const oldIds = all.slice(20).map((v) => v.id);
          await prisma.flowVersion.deleteMany({
            where: { id: { in: oldIds } },
          });
        }
      } catch (e) {
        console.error("FlowVersion snapshot failed (shared edit):", e.message);
      }
    }

    return updated;
  }

  async duplicateSharedFlow(id, userId, appContext = "free") {
    // Get the flow if user has access
    const flowData = await this.getFlowByIdWithAccess(id, userId);
    if (!flowData) throw new AppError("Flow not found", 404, "NOT_FOUND");
    if (flowData.permission === "view")
      throw new AppError("Cannot duplicate view-only flow", 403, "FORBIDDEN");

    return await prisma.flow.create({
      data: {
        name: `${flowData.name} (Copy)`,
        description: flowData.description,
        thumbnail: flowData.thumbnail,
        diagramData: flowData.diagramData,
        isPublic: false,
        ownerId: userId,
        version: flowData.version,
        appContext,
      },
    });
  }

  // ==================== END SHARING ====================

  async updateDiagramState(id, userId, groupId, newShape) {
    const flow = await this.getFlowById(id, userId);
    if (!flow) throw new AppError("Flow not found", 404, "NOT_FOUND");

    // Parse diagramData if stored as string
    let currentData = flow.diagramData || { groups: [] };
    if (typeof currentData === "string") {
      try {
        currentData = JSON.parse(currentData);
      } catch {
        currentData = { groups: [] };
      }
    }

    const updatedDiagramData = produce(currentData, (draft) => {
      let group = draft.groups.find((g) => g.id === groupId);
      if (!group) {
        group = { id: groupId, children: [] };
        draft.groups.push(group);
      }
      group.children.push(newShape);
    });

    const serialized =
      typeof updatedDiagramData === "string"
        ? updatedDiagramData
        : JSON.stringify(updatedDiagramData);

    await prisma.flow.update({
      where: { id },
      data: { diagramData: serialized },
    });

    return updatedDiagramData;
  }

  // Flows shown in the picker modal. Order: shared first, then most-
  // recently updated. Only PERSONAL flows (teamId null) are at risk.
  async getPickerList(userId) {
    const flows = await prisma.flow.findMany({
      where: {
        ownerId: userId,
        teamId: null,
        // Include both active and currently-marked-for-downgrade flows
        // so the user can see what's at risk and pick from everything.
        OR: [{ deletedAt: null }, { markedForDowngrade: true }],
      },
      select: {
        id: true,
        name: true,
        thumbnail: true,
        updatedAt: true,
        markedForDowngrade: true,
        deletedAt: true,
        _count: { select: { flowShares: true } },
      },
    });
    flows.sort((a, b) => {
      const aShared = a._count.flowShares > 0 ? 1 : 0;
      const bShared = b._count.flowShares > 0 ? 1 : 0;
      if (aShared !== bShared) return bShared - aShared;
      return b.updatedAt - a.updatedAt;
    });
    return flows.map((f) => ({
      id: f.id,
      name: f.name,
      thumbnail: f.thumbnail,
      updatedAt: f.updatedAt,
      shareCount: f._count.flowShares,
      isShared: f._count.flowShares > 0,
      markedForDowngrade: f.markedForDowngrade,
    }));
  }

  // Confirm the user's 10-flow selection. Trashes everything else.
  async confirmSelection(userId, selectedIds) {
    if (!Array.isArray(selectedIds)) {
      throw new AppError(
        "selectedFlowIds must be an array",
        400,
        "VALIDATION_ERROR",
      );
    }
    if (selectedIds.length > 10) {
      throw new AppError("You can keep at most 10 flows", 400, "TOO_MANY");
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isInFlowPickerPhase: true },
    });
    if (!user?.isInFlowPickerPhase) {
      throw new AppError(
        "Not in flow-picker phase",
        400,
        "NOT_IN_PICKER_PHASE",
      );
    }

    // Verify ownership of every selected ID.
    const owned = await prisma.flow.findMany({
      where: { id: { in: selectedIds }, ownerId: userId },
      select: { id: true },
    });
    if (owned.length !== selectedIds.length) {
      throw new AppError(
        "One or more flows are not owned by you",
        403,
        "FORBIDDEN",
      );
    }

    const allPersonal = await prisma.flow.findMany({
      where: { ownerId: userId, teamId: null },
      select: { id: true, deletedAt: true },
    });
    const selectedSet = new Set(selectedIds);
    const toTrash = allPersonal.filter(
      (f) => !selectedSet.has(f.id) && f.deletedAt === null,
    );
    const trashedIds = toTrash.map((f) => f.id);

    const now = new Date();
    await prisma.$transaction([
      prisma.flow.updateMany({
        where: { id: { in: trashedIds } },
        data: { deletedAt: now, markedForDowngrade: true },
      }),
      // Selected stay active; clear the downgrade flag in case it was set.
      prisma.flow.updateMany({
        where: { id: { in: Array.from(selectedSet) } },
        data: { markedForDowngrade: false, deletedAt: null },
      }),
      prisma.user.update({
        where: { id: userId },
        data: {
          isInFlowPickerPhase: false,
          proFlowLimit: 10,
        },
      }),
    ]);

    return {
      keptFlows: selectedIds.length,
      trashedFlows: trashedIds.length,
      trashedIds,
    };
  }

  // Pack-status snapshot used by the frontend banner.
  async getPackStatus(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        proFlowLimit: true,
        proAdditionalFlowsPurchased: true,
        proUnlimitedFlows: true,
        activeFlowPackId: true,
        flowPackExpiresAt: true,
        isInFlowPickerPhase: true,
      },
    });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");

    const activePack = user.activeFlowPackId
      ? await prisma.proFlowPurchase.findUnique({
          where: { id: user.activeFlowPackId },
        })
      : null;

    const flowCount = await prisma.flow.count({
      where: { ownerId: userId, teamId: null, deletedAt: null },
    });

    const limit = user.proUnlimitedFlows
      ? -1
      : user.proFlowLimit + user.proAdditionalFlowsPurchased;

    let daysUntilExpiry = null;
    if (user.flowPackExpiresAt) {
      daysUntilExpiry = Math.ceil(
        (new Date(user.flowPackExpiresAt).getTime() - Date.now()) /
          (24 * 3600 * 1000),
      );
    }

    return {
      activePackId: user.activeFlowPackId,
      packType: activePack?.packType || null,
      isUnlimited: !!user.proUnlimitedFlows,
      expiresAt: user.flowPackExpiresAt,
      gracePeriodEndsAt: activePack?.gracePeriodEndsAt || null,
      status: activePack?.status || null,
      flowCount,
      flowLimit: limit,
      isInPickerPhase: !!user.isInFlowPickerPhase,
      daysUntilExpiry,
    };
  }
}

module.exports = new FlowService();
