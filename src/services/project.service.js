const { prisma } = require("../lib/prisma");
const AppError = require("../utils/AppError");

class ProjectService {
  async getAllProjects(userId, options = {}, appContext = "free") {
    const { search, teamId = null } = options;

    // Personal context: user's own projects with teamId=null.
    // Team context: every project belonging to that team (any creator) so
    // members see the same workspace.
    const where = teamId
      ? { teamId, deletedAt: null, appContext: "team" }
      : { createdBy: userId, teamId: null, deletedAt: null, appContext };

    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const projects = await prisma.project.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: {
            flows: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      coverImage: p.coverImage,
      createdBy: p.createdBy,
      teamId: p.teamId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      flowCount: p._count.flows,
    }));
  }

  async getProjectById(id, userId, appContext) {
    // Authorize: either the user is the creator (personal project) or the
    // user is a member/owner of the team that owns this project.
    const project = await prisma.project.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(appContext ? { appContext } : {}),
        OR: [
          { createdBy: userId },
          {
            team: {
              OR: [{ teamOwnerId: userId }, { members: { some: { userId } } }],
            },
          },
        ],
      },
    });
    if (!project) throw new AppError("Project not found", 404, "NOT_FOUND");
    return project;
  }

  async getProjectWithFlows(id, userId, options = {}) {
    const { search, page = 1, limit = 50 } = options;
    const project = await this.getProjectById(id, userId);

    const take = Math.min(Number(limit) || 50, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    // Show flows whose workspace matches the project's. Personal projects
    // surface the caller's own free flows; team projects surface every flow
    // attached to that team (any owner) so all team members see the same
    // workspace.
    const flowWhere = project.teamId
      ? {
          projectId: id,
          teamId: project.teamId,
          deletedAt: null,
          appContext: "team",
        }
      : {
          projectId: id,
          ownerId: userId,
          teamId: null,
          deletedAt: null,
          appContext: project.appContext,
        };

    if (search) {
      flowWhere.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const [flows, total] = await Promise.all([
      prisma.flow.findMany({
        where: flowWhere,
        skip,
        take,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.flow.count({ where: flowWhere }),
    ]);

    return {
      ...project,
      flows,
      total,
      page: Number(page) || 1,
      totalPages: Math.ceil(total / take),
    };
  }

  async createProject(userId, data, appContext = "free") {
    const teamId = data.teamId || null;

    // Team-scoped: caller must be a member or the owner of that team.
    if (teamId) {
      const [team, membership] = await Promise.all([
        prisma.team.findUnique({ where: { id: teamId } }),
        prisma.teamMember.findFirst({
          where: { teamId, userId },
          select: { id: true },
        }),
      ]);
      if (!team || team.deletedAt) {
        throw new AppError("Team not found", 404, "NOT_FOUND");
      }
      if (!membership && team.teamOwnerId !== userId) {
        throw new AppError(
          "You are not a member of this team",
          403,
          "FORBIDDEN",
        );
      }
    }

    return await prisma.project.create({
      data: {
        name: data.name,
        description: data.description || null,
        createdBy: userId,
        teamId,
        appContext: teamId ? "team" : appContext,
      },
    });
  }

  async updateProject(id, userId, data) {
    const project = await this.getProjectById(id, userId);

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined)
      updateData.description = data.description;

    return await prisma.project.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteProject(id, userId) {
    const project = await this.getProjectById(id, userId);

    // Unassign every flow attached to this project regardless of owner so
    // a team-project deletion doesn't leave dangling FK references on
    // teammates' flows.
    await prisma.flow.updateMany({
      where: { projectId: id },
      data: { projectId: null },
    });

    // Soft delete the project
    return await prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async assignFlow(projectId, userId, flowId) {
    // Authorize project access (creator or team member).
    const project = await this.getProjectById(projectId, userId);

    // First locate the flow with broad authorization (caller owns it OR is
    // a member of its team). 404 only when the flow truly isn't accessible
    // — workspace mismatches surface as 400 below so the UI can explain.
    const flow = await prisma.flow.findFirst({
      where: {
        id: flowId,
        deletedAt: null,
        OR: [
          { ownerId: userId },
          {
            team: {
              OR: [{ teamOwnerId: userId }, { members: { some: { userId } } }],
            },
          },
        ],
      },
    });
    if (!flow) throw new AppError("Flow not found", 404, "NOT_FOUND");

    // Reject cross-context / cross-team assignment.
    if (flow.appContext !== project.appContext) {
      throw new AppError(
        "Flow and project belong to different workspaces",
        400,
        "CONTEXT_MISMATCH",
      );
    }
    if ((flow.teamId || null) !== (project.teamId || null)) {
      throw new AppError(
        "Flow and project belong to different teams",
        400,
        "CONTEXT_MISMATCH",
      );
    }

    return await prisma.flow.update({
      where: { id: flowId },
      data: { projectId },
    });
  }

  async unassignFlow(projectId, userId, flowId) {
    const project = await this.getProjectById(projectId, userId);

    // Team project → any team member's flow can be unassigned by another
    // team member; personal project → only the owner's flow.
    const flow = await prisma.flow.findFirst({
      where: project.teamId
        ? { id: flowId, projectId, teamId: project.teamId, deletedAt: null }
        : {
            id: flowId,
            projectId,
            ownerId: userId,
            teamId: null,
            deletedAt: null,
          },
    });
    if (!flow)
      throw new AppError("Flow not found in this project", 404, "NOT_FOUND");

    return await prisma.flow.update({
      where: { id: flowId },
      data: { projectId: null },
    });
  }
}

module.exports = new ProjectService();
