const { prisma } = require("../lib/prisma");
const AppError = require("../utils/AppError");

class ProjectService {
  async getAllProjects(userId, options = {}, appContext = "team") {
    const { search, teamId } = options;

    // Own account (no teamId) shows projects in the active appContext only;
    // a joined team shows only the projects they created in it.
    // Never teamId alone (DATA-LOSS-001).
    const where = {
      createdBy: userId,
      deletedAt: null,
    };
    if (teamId) {
      // Mirror flow.service: own team-app team = personal context, include
      // NULL-teamId projects created before the team existed (upgrade fix).
      const isOwnTeamAppTeam = await prisma.team.findFirst({
        where: {
          id: teamId,
          teamOwnerId: userId,
          appContext: { in: ["team", "free"] },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (isOwnTeamAppTeam) {
        where.OR = [{ teamId: null }, { teamId }];
      } else {
        where.teamId = teamId;
      }
    } else {
      where.appContext = appContext;
    }

    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const projects = await prisma.project.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    // B42: count each project's flows with the SAME scope the details list uses
    // (via _projectFlowWhere) so the card count matches what the details page
    // actually shows. Previously the card counted every non-deleted flow with
    // that projectId, over-counting team/cross-scope flows the details excluded.
    const counts = await Promise.all(
      projects.map((p) =>
        prisma.flow.count({ where: this._projectFlowWhere(p, userId) }),
      ),
    );

    return projects.map((p, i) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      coverImage: p.coverImage,
      createdBy: p.createdBy,
      teamId: p.teamId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      flowCount: counts[i],
    }));
  }

  // B42: single source of truth for "which flows belong to this project".
  // The All-Projects card count and the Project-Details list MUST use the
  // exact same scope or the card over-counts (card said 2, details showed 1)
  // — a team-scoped flow was counted but excluded from the list. Both now
  // call this helper, so the count and the list are always identical.
  _projectFlowWhere(project, userId) {
    return project.teamId
      ? {
          projectId: project.id,
          teamId: project.teamId,
          deletedAt: null,
          appContext: { in: ["team", "free"] },
        }
      : {
          projectId: project.id,
          ownerId: userId,
          teamId: null,
          deletedAt: null,
          appContext:
            project.appContext === "free"
              ? { in: ["team", "free"] }
              : project.appContext,
        };
  }

  async getProjectById(id, userId, appContext) {
    // Authorize: either the user is the creator (personal project) or the
    // user is a member/owner of the team that owns this project.
    const project = await prisma.project.findFirst({
      where: {
        id,
        deletedAt: null,
        // No appContext gate — access is by creator/team membership only.
        // Filtering by the live plan tier hid personal projects post-upgrade
        // (DATA-LOSS-001).
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

    // Show flows whose workspace matches the project's — SAME scope as the
    // All-Projects card count (B42), via the shared helper.
    const flowWhere = this._projectFlowWhere(project, userId);

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

  async createProject(userId, data, appContext) {
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

    // Reject cross-team assignment. The teamId boundary (personal vs a
    // specific team) is the real workspace boundary — we intentionally do NOT
    // compare appContext, since a personal free-era flow and a personal
    // project created after upgrade legitimately differ in that legacy tag
    // (DATA-LOSS-001) yet both belong to the same personal workspace.
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
