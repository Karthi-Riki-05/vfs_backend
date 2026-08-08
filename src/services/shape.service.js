const { prisma } = require("../lib/prisma");
const { resolveWorkspaceId } = require("../lib/workspaceScope");
const { visibleTeamsWhere } = require("../lib/teamMembership");
const { workspaceScope } = require("../lib/workspaceScope");
const AppError = require("../utils/AppError");
const { sanitizeShapeContent } = require("../utils/sanitizeSvg");

class ShapeService {
  async getAllShapes(userId, appContext = "team", requestedWorkspaceId = null) {
    // Public shapes are global. Private shapes are scoped to the ACTIVE
    // workspace, which under the owner-as-workspace model (2026-08-07) is a
    // single equality on the tenant owner's user id.
    //
    // NOTE `ownerId` is deliberately NOT part of the scope any more: it records
    // who DREW the shape, while `workspaceId` records which workspace it lives
    // in — and everything inside a workspace is shared. The old
    // ownerId + owned-team OR-clauses went with the team boundary.
    const scope = await workspaceScope(userId, requestedWorkspaceId, appContext);
    const { workspaceId } = scope;
    // Spread the WHOLE scope, not just the workspace id. `scope` also carries
    // the app boundary (appScope), and destructuring only `workspaceId` threw
    // it away — so a Pro-app shape appeared in the Team app and vice-versa,
    // even though the scope had been computed correctly one line above.
    const ownedClause = { ...scope };

    // B51 — the shared shape LIBRARY is still TEAM-scoped (`associatedTeamId`
    // is a real team reference, deliberately left un-renamed). Only teams the
    // caller actually belongs to, inside this workspace, contribute a library.
    const libraryTeams = await prisma.team.findMany({
      where: {
        teamOwnerId: workspaceId,
        deletedAt: null,
        // The library follows the app boundary too — a Pro team's shapes must
        // not surface in the Team app.
        ...(appContext === "pro"
          ? { appContext: "pro" }
          : { appContext: { not: "pro" } }),
        ...(await visibleTeamsWhere(userId)),
      },
      select: { id: true },
    });
    const libraryTeamIds = libraryTeams.map((t) => t.id);

    return await prisma.shape.findMany({
      where: {
        deletedAt: null,
        OR: [
          { isPublic: true },
          ownedClause,
          ...(libraryTeamIds.length
            ? [{ associatedTeamId: { in: libraryTeamIds } }]
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
          ...(await visibleTeamsWhere(userId)),
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
          ...(await visibleTeamsWhere(userId)),
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

  // Truly public, unauthenticated read — no userId at all. Only shapes the
  // owner explicitly flagged isPublic=true are reachable here.
  async getPublicShape(id) {
    const shape = await prisma.shape.findFirst({
      where: { id, isPublic: true, deletedAt: null },
    });
    return shape;
  }

  async createShape(userId, data, appContext) {
    // bug-110 (2026-08-08): resolve the workspace the way every other write
    // does. This used to be `data.workspaceId || null`, so a shape created in
    // the caller's OWN workspace — where the client sends no
    // X-Workspace-Context — was written with `workspace_id = NULL`. Reads scope
    // by `{ workspaceId }`, an equality NULL can never match, so the shape
    // saved fine and then never appeared. Confirmed live: spiderman123's "gg"
    // has owner_id set and workspace_id empty.
    //
    // owner-as-workspace (2026-08-07) says a personal row carries the user's
    // OWN id precisely so nothing can silently "become personal" (bug-094);
    // this write was never moved onto that rule. resolveWorkspaceId verifies a
    // claimed workspace server-side and falls back to the caller's own, so it
    // is also the DATA-LOSS-001-safe way to read the header.
    //
    // The old Pro branch below it looked up `team.findFirst({ teamOwnerId,
    // appContext: "pro" })` and stored a TEAM id in this column. After the
    // rename the column holds USER ids, so that value could never match a read
    // scope either — and when no such team existed it threw
    // PRO_TEAM_NOT_READY at a user whose workspace was perfectly ready. The Pro
    // app is separated by `appContext`, not by a second workspace row, so the
    // whole branch is gone.
    const workspaceId = await resolveWorkspaceId(
      userId,
      data.workspaceId || null,
    );

    return await prisma.shape.create({
      data: {
        name: data.name,
        type: data.type,
        // Sanitized here — content/xmlContent render via
        // dangerouslySetInnerHTML in ShapeCard.tsx and the public
        // /shapes/view/:id viewer with no other sanitization in the path.
        content: sanitizeShapeContent(data.content),
        textAlignment: data.textAlignment,
        groupId: data.groupId,
        category: data.category,
        xmlContent: sanitizeShapeContent(data.xmlContent),
        thumbnail: data.thumbnail,
        isPublic: data.isPublic || false,
        ownerId: userId,
        workspaceId,
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
    if (data.content !== undefined)
      updateData.content = sanitizeShapeContent(data.content);
    if (data.textAlignment !== undefined)
      updateData.textAlignment = data.textAlignment;
    if (data.groupId !== undefined) updateData.groupId = data.groupId;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.xmlContent !== undefined)
      updateData.xmlContent = sanitizeShapeContent(data.xmlContent);
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
        xmlContent: sanitizeShapeContent(inlineShape.xmlContent) || null,
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
        ...(await visibleTeamsWhere(userId)),
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

  async copyShape(userId, shapeId) {
    const source = await prisma.shape.findFirst({
      where: { id: shapeId, deletedAt: null },
    });

    if (!source) throw new AppError("Shape not found", 404, "NOT_FOUND");
    // B13/B14: copy must be allowed for any shape the caller can SEE (public,
    // owned, or team/group-associated) — not owner-only. The visibility gate
    // (_canAccessShape) previously guarded reads but copy used a stricter
    // ownerId check, so copying a public/team-library shape 403'd ("Failed to
    // copy shape"). The new row is created under the caller's ownership below,
    // so this is safe.
    const canAccess = await this._canAccessShape(source, userId);
    if (!canAccess)
      throw new AppError("Not allowed to copy this shape", 403, "FORBIDDEN");

    const copy = await prisma.shape.create({
      data: {
        name: source.name + " (Copy)",
        type: source.type,
        // Re-sanitize on copy too — defense-in-depth for any shape stored
        // before this sanitization existed.
        content: sanitizeShapeContent(source.content),
        textAlignment: source.textAlignment,
        ratioLock: source.ratioLock,
        shapeType: source.shapeType,
        groupId: source.groupId,
        category: source.category,
        xmlContent: sanitizeShapeContent(source.xmlContent),
        thumbnail: source.thumbnail,
        isPublic: false,
        ownerId: userId,
        workspaceId: source.workspaceId,
        appContext: source.appContext,
        // associations are NOT copied — the duplicate starts unassociated
      },
    });

    return copy;
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
