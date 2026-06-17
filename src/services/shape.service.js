const { prisma } = require("../lib/prisma");
const AppError = require("../utils/AppError");

class ShapeService {
  async getAllShapes(userId, appContext = "team", teamId = null) {
    // Public shapes are global. Private shapes follow strict workspace scoping
    // (DATA-LOSS-001): a joined team shows only shapes the user created in it;
    // personal shows shapes with NO team OR in a team the user OWNS (owned
    // teams fold into the personal context — see getMyContexts).
    let ownedClause;
    if (teamId) {
      ownedClause = { ownerId: userId, teamId };
    } else if (appContext === "pro") {
      // Pro user without header — same defense-in-depth as flow.service: never
      // include teamId=null shapes. Use the user's pro team for strict isolation.
      const proTeam = await prisma.team.findFirst({
        where: { teamOwnerId: userId, appContext: "pro", deletedAt: null },
        select: { id: true },
      });
      ownedClause = {
        ownerId: userId,
        teamId: proTeam?.id ?? "__no_pro_team__",
      };
    } else {
      // Personal context = NULL team + team-app owned teams only.
      // Pro-app owned teams (appContext='pro') are excluded so pro shapes
      // don't leak into the team-app personal view (cross-app isolation).
      const ownedTeams = await prisma.team.findMany({
        where: { teamOwnerId: userId, appContext: "team", deletedAt: null },
        select: { id: true },
      });
      const ownedTeamIds = ownedTeams.map((t) => t.id);
      ownedClause = {
        ownerId: userId,
        OR: [
          { teamId: null },
          ...(ownedTeamIds.length ? [{ teamId: { in: ownedTeamIds } }] : []),
        ],
      };
    }
    // Team-shared shape library: shapes explicitly associated with a team
    // the user belongs to (owner or member) are visible to all its members.
    const memberTeams = await prisma.team.findMany({
      where: {
        deletedAt: null,
        OR: [{ teamOwnerId: userId }, { members: { some: { userId } } }],
      },
      select: { id: true },
    });
    const memberTeamIds = memberTeams.map((t) => t.id);

    return await prisma.shape.findMany({
      where: {
        deletedAt: null,
        OR: [
          { isPublic: true },
          ownedClause,
          ...(memberTeamIds.length
            ? [{ associatedTeamId: { in: memberTeamIds } }]
            : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      include: { group: true },
    });
  }

  // Visibility gate for single-record reads — mirrors getAllShapes:
  // a shape is readable if it's public, owned by the caller, or associated
  // with a team / chat group the caller belongs to. Without this, raw-id
  // reads leaked private + cross-workspace shapes (IDOR).
  async _canAccessShape(shape, userId) {
    if (!shape) return false;
    if (shape.isPublic) return true;
    if (shape.ownerId === userId) return true;
    if (shape.associatedTeamId) {
      const team = await prisma.team.findFirst({
        where: {
          id: shape.associatedTeamId,
          deletedAt: null,
          OR: [{ teamOwnerId: userId }, { members: { some: { userId } } }],
        },
        select: { id: true },
      });
      if (team) return true;
    }
    if (shape.associatedChatGroupId) {
      const group = await prisma.chatGroup.findFirst({
        where: {
          id: shape.associatedChatGroupId,
          deletedAt: null,
          OR: [{ userId }, { members: { some: { userId } } }],
        },
        select: { id: true },
      });
      if (group) return true;
    }
    return false;
  }

  // Team / chat-group ids the caller belongs to — used to scope batch reads
  // so association enumeration can't reveal foreign-workspace shapes.
  async _accessibleScopeIds(userId) {
    const [teams, groups] = await Promise.all([
      prisma.team.findMany({
        where: {
          deletedAt: null,
          OR: [{ teamOwnerId: userId }, { members: { some: { userId } } }],
        },
        select: { id: true },
      }),
      prisma.chatGroup.findMany({
        where: {
          deletedAt: null,
          OR: [{ userId }, { members: { some: { userId } } }],
        },
        select: { id: true },
      }),
    ]);
    return {
      teamIds: teams.map((t) => t.id),
      groupIds: groups.map((g) => g.id),
    };
  }

  async getShapeById(id, userId) {
    const shape = await prisma.shape.findFirst({
      where: { id, deletedAt: null },
    });
    // Return null (→ 404) rather than 403 so existence of foreign shapes
    // isn't disclosed.
    if (!(await this._canAccessShape(shape, userId))) return null;
    return shape;
  }

  async createShape(userId, data, appContext) {
    let teamId = data.teamId || null;

    // Auto-assign the pro team so pro shapes land in the correct bucket
    // even when the caller doesn't pass an explicit teamId.
    if (appContext === "pro" && !teamId) {
      const proTeam = await prisma.team.findFirst({
        where: { teamOwnerId: userId, appContext: "pro", deletedAt: null },
        select: { id: true },
      });
      if (proTeam) teamId = proTeam.id;
    }

    return await prisma.shape.create({
      data: {
        name: data.name,
        type: data.type,
        content: data.content,
        textAlignment: data.textAlignment,
        groupId: data.groupId,
        category: data.category,
        xmlContent: data.xmlContent,
        thumbnail: data.thumbnail,
        isPublic: data.isPublic || false,
        ownerId: userId,
        teamId,
        appContext,
      },
    });
  }

  async updateShape(id, userId, data) {
    const shape = await prisma.shape.findFirst({
      where: { id, ownerId: userId, deletedAt: null },
    });
    if (!shape) throw new AppError("Shape not found", 404, "NOT_FOUND");

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.content !== undefined) updateData.content = data.content;
    if (data.textAlignment !== undefined)
      updateData.textAlignment = data.textAlignment;
    if (data.groupId !== undefined) updateData.groupId = data.groupId;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.xmlContent !== undefined) updateData.xmlContent = data.xmlContent;
    if (data.thumbnail !== undefined) updateData.thumbnail = data.thumbnail;
    if (data.isPublic !== undefined) updateData.isPublic = data.isPublic;

    return await prisma.shape.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteShape(id, userId) {
    const shape = await prisma.shape.findFirst({
      where: { id, ownerId: userId, deletedAt: null },
    });
    if (!shape) throw new AppError("Shape not found", 404, "NOT_FOUND");

    // Soft delete — keep the row for recovery, drop any association.
    return await prisma.shape.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        associatedTeamId: null,
        associatedChatGroupId: null,
        associationType: null,
      },
    });
  }

  async getCategories() {
    const shapes = await prisma.shape.findMany({
      where: { deletedAt: null },
      select: { category: true },
      distinct: ["category"],
    });
    return shapes.map((s) => s.category);
  }

  // ── Shape ↔ Team / Chat Group association ────────────────────────────

  // Diagram cells have no Shape row until first associated — "ensure"
  // semantics: when shapeId is missing/unknown and inline shape data is
  // provided, create the row and associate it in one call.
  async _ensureShape(shapeId, userId, inlineShape, appContext) {
    if (shapeId && shapeId !== "new") {
      const existing = await prisma.shape.findFirst({
        where: { id: shapeId, deletedAt: null },
      });
      if (existing) {
        if (existing.ownerId !== userId) {
          throw new AppError("Not the owner of this shape", 403, "FORBIDDEN");
        }
        return existing;
      }
    }
    if (!inlineShape || !inlineShape.name) {
      throw new AppError("Shape not found", 404, "NOT_FOUND");
    }
    return await prisma.shape.create({
      data: {
        name: inlineShape.name,
        type: "shape",
        xmlContent: inlineShape.xmlContent || null,
        thumbnail: inlineShape.thumbnail || null,
        ownerId: userId,
        appContext: appContext || "team",
      },
    });
  }

  async associateTeam(shapeId, userId, teamId, inlineShape, appContext) {
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        deletedAt: null,
        OR: [{ teamOwnerId: userId }, { members: { some: { userId } } }],
      },
      select: { id: true, name: true },
    });
    if (!team) {
      throw new AppError("Team not found or access denied", 404, "NOT_FOUND");
    }

    const shape = await this._ensureShape(
      shapeId,
      userId,
      inlineShape,
      appContext,
    );

    const updated = await prisma.shape.update({
      where: { id: shape.id },
      data: {
        associatedTeamId: teamId,
        associatedChatGroupId: null, // exclusive: team OR group, never both
        associationType: "team",
        updatedAt: new Date(),
      },
    });
    return { shape: updated, team };
  }

  async associateGroup(shapeId, userId, groupId, inlineShape, appContext) {
    const group = await prisma.chatGroup.findFirst({
      where: {
        id: groupId,
        deletedAt: null,
        OR: [{ userId }, { members: { some: { userId } } }],
      },
      select: { id: true, title: true },
    });
    if (!group) {
      throw new AppError(
        "Chat group not found or access denied",
        404,
        "NOT_FOUND",
      );
    }

    const shape = await this._ensureShape(
      shapeId,
      userId,
      inlineShape,
      appContext,
    );

    const updated = await prisma.shape.update({
      where: { id: shape.id },
      data: {
        associatedChatGroupId: groupId,
        associatedTeamId: null, // exclusive: team OR group, never both
        associationType: "group",
        updatedAt: new Date(),
      },
    });
    return { shape: updated, group };
  }

  async removeAssociation(shapeId, userId) {
    const shape = await prisma.shape.findFirst({
      where: { id: shapeId, ownerId: userId, deletedAt: null },
    });
    if (!shape) throw new AppError("Shape not found", 404, "NOT_FOUND");

    return await prisma.shape.update({
      where: { id: shapeId },
      data: {
        associatedTeamId: null,
        associatedChatGroupId: null,
        associationType: null,
        updatedAt: new Date(),
      },
    });
  }

  async getAssociation(shapeId, userId) {
    const shape = await prisma.shape.findFirst({
      where: { id: shapeId, deletedAt: null },
      include: {
        associatedTeam: { select: { id: true, name: true } },
        associatedChatGroup: { select: { id: true, title: true } },
      },
    });
    // 404 on no-access too — never confirm a foreign shape's existence/links.
    if (!(await this._canAccessShape(shape, userId))) {
      throw new AppError("Shape not found", 404, "NOT_FOUND");
    }

    if (shape.associationType === "team" && shape.associatedTeam) {
      return {
        shapeId: shape.id,
        type: "team",
        team: shape.associatedTeam,
      };
    }
    if (shape.associationType === "group" && shape.associatedChatGroup) {
      return {
        shapeId: shape.id,
        type: "group",
        group: {
          id: shape.associatedChatGroup.id,
          name: shape.associatedChatGroup.title,
        },
      };
    }
    return { shapeId: shape.id, type: null };
  }

  async checkAssociations(shapeIds, userId) {
    // Scope the batch to shapes the caller can actually see, otherwise this
    // endpoint becomes an association-enumeration oracle for foreign shapes.
    const { teamIds, groupIds } = await this._accessibleScopeIds(userId);
    const shapes = await prisma.shape.findMany({
      where: {
        id: { in: shapeIds },
        deletedAt: null,
        NOT: { associationType: null },
        OR: [
          { ownerId: userId },
          { isPublic: true },
          ...(teamIds.length ? [{ associatedTeamId: { in: teamIds } }] : []),
          ...(groupIds.length
            ? [{ associatedChatGroupId: { in: groupIds } }]
            : []),
        ],
      },
      include: {
        associatedTeam: { select: { id: true, name: true } },
        associatedChatGroup: { select: { id: true, title: true } },
      },
    });
    return shapes.map((s) => ({
      shapeId: s.id,
      shapeName: s.name,
      type: s.associationType,
      team:
        s.associationType === "team" && s.associatedTeam
          ? s.associatedTeam
          : null,
      group:
        s.associationType === "group" && s.associatedChatGroup
          ? {
              id: s.associatedChatGroup.id,
              name: s.associatedChatGroup.title,
            }
          : null,
    }));
  }

  async bulkDelete(shapeIds, userId) {
    // Only the caller's own shapes are touched — unknown / foreign ids are
    // silently skipped so deleting a mixed diagram never 403s midway.
    const result = await prisma.shape.updateMany({
      where: { id: { in: shapeIds }, ownerId: userId, deletedAt: null },
      data: {
        deletedAt: new Date(),
        associatedTeamId: null,
        associatedChatGroupId: null,
        associationType: null,
      },
    });
    return { deletedCount: result.count };
  }
}

module.exports = new ShapeService();
