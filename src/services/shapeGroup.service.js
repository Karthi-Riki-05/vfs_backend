const { prisma } = require("../lib/prisma");
const { resolveWorkspaceId } = require("../lib/workspaceScope");
const { workspaceScope } = require("../lib/workspaceScope");
const AppError = require("../utils/AppError");

class ShapeGroupService {
  async getAllGroups(userId, appContext = "team", requestedWorkspaceId = null) {
    // Scoped to the ACTIVE workspace only (owner-as-workspace, 2026-08-07).
    // `userId` is deliberately NOT in the where any more — it records who
    // created the group, and groups are shared across the workspace.
    //
    // This also closes the leak found on 2026-08-07: the old personal branch
    // filtered on `appContext` alone with no workspace term, so a group created
    // inside a team showed up in its creator's PERSONAL list.
    return await prisma.shapeGroup.findMany({
      where: await workspaceScope(userId, requestedWorkspaceId, appContext),
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { shapes: true } } },
    });
  }

  async getGroupById(id, userId) {
    const group = await prisma.shapeGroup.findFirst({
      where: { id, userId },
      include: { shapes: true, _count: { select: { shapes: true } } },
    });
    if (!group) throw new AppError("Shape group not found", 404, "NOT_FOUND");
    return group;
  }

  async createGroup(userId, data, appContext = "team") {
    // bug-110: same fault as createShape — `data.workspaceId || null` wrote NULL
    // for a group created in the caller's OWN workspace (no
    // X-Workspace-Context is sent there), and reads scope by `{ workspaceId }`,
    // which NULL never matches. The group saved and then vanished.
    //
    // resolveWorkspaceId falls back to the caller's own workspace and verifies
    // any claimed one server-side (DATA-LOSS-001).
    const workspaceId = await resolveWorkspaceId(
      userId,
      data.workspaceId || null,
    );
    return await prisma.shapeGroup.create({
      data: {
        name: data.name,
        userId,
        // Tag the active workspace bucket.
        workspaceId,
        appContext,
      },
    });
  }

  async updateGroup(id, userId, data) {
    const group = await prisma.shapeGroup.findFirst({ where: { id, userId } });
    if (!group) throw new AppError("Shape group not found", 404, "NOT_FOUND");

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.isPredefined !== undefined)
      updateData.isPredefined = data.isPredefined;

    return await prisma.shapeGroup.update({ where: { id }, data: updateData });
  }

  async deleteGroup(id, userId) {
    const group = await prisma.shapeGroup.findFirst({
      where: { id, userId },
      include: { _count: { select: { shapes: true } } },
    });
    if (!group) throw new AppError("Shape group not found", 404, "NOT_FOUND");

    // Cascade: delete all shapes in the group, then delete the group
    await prisma.$transaction([
      prisma.shape.deleteMany({ where: { groupId: id } }),
      prisma.shapeGroup.delete({ where: { id } }),
    ]);

    return { deletedShapes: group._count.shapes };
  }
}

module.exports = new ShapeGroupService();
