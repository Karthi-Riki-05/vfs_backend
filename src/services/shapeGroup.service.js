const { prisma } = require("../lib/prisma");
const AppError = require("../utils/AppError");

class ShapeGroupService {
  async getAllGroups(userId, appContext = "team", teamId = null) {
    // Mirror flow.service._workspaceScope: if teamId belongs to the user's OWN
    // team-app team, include NULL-teamId groups created before the team existed
    // (upgrade data-loss fix). Joined teams stay strict (teamId only).
    let whereExtra;
    if (teamId) {
      const isOwnTeamAppTeam = await prisma.team.findFirst({
        where: {
          id: teamId,
          teamOwnerId: userId,
          appContext: { in: ["team", "free"] },
          deletedAt: null,
        },
        select: { id: true },
      });
      whereExtra = isOwnTeamAppTeam
        ? { OR: [{ teamId: null }, { teamId }] }
        : { teamId };
    } else {
      whereExtra = { appContext };
    }
    return await prisma.shapeGroup.findMany({
      where: { userId, ...whereExtra },
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
    return await prisma.shapeGroup.create({
      data: {
        name: data.name,
        userId,
        // Tag the active workspace bucket.
        teamId: data.teamId || null,
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
