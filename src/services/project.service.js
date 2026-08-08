const { prisma } = require("../lib/prisma");
const { resolveWorkspaceId } = require("../lib/workspaceScope");
const {
  workspaceScope,
  appScope,
  canEnterWorkspace,
  accessibleWorkspaceIds,
} = require("../lib/workspaceScope");
const AppError = require("../utils/AppError");

class ProjectService {
  async getAllProjects(userId, options = {}, appContext = "team") {
    const { search, workspaceId: requestedWorkspaceId } = options;

    // Scoped to the ACTIVE workspace only (owner-as-workspace, 2026-08-07).
    // `createdBy` is no longer part of the scope — projects are shared across
    // the workspace. This also closes the leak found on 2026-08-07, where the
    // personal branch filtered on `appContext` with no workspace term at all,
    // so a project created inside a team appeared in the creator's PERSONAL
    // list.
    const where = {
      ...(await workspaceScope(userId, requestedWorkspaceId, appContext)),
      deletedAt: null,
    };

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
      workspaceId: p.workspaceId,
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
    // owner-as-workspace: every project names its workspace, so the old
    // personal (workspaceId: null) branch is gone. appScope keeps the Pro app
    // separate from the Team app without ever narrowing to `team` alone
    // (DATA-LOSS-001 — that would hide free-era flows after an upgrade).
    return {
      projectId: project.id,
      workspaceId: project.workspaceId,
      deletedAt: null,
      ...appScope(project.appContext),
    };
  }

  async getProjectById(id, userId, appContext) {
    // Authorize: either the user is the creator (personal project) or the
    // user is a member/owner of the team that owns this project.
    // Access is by workspace membership. No appContext gate — filtering by the
    // live plan tier hid personal projects post-upgrade (DATA-LOSS-001).
    const project = await prisma.project.findFirst({
      where: { id, deletedAt: null },
    });
    if (!project) throw new AppError("Project not found", 404, "NOT_FOUND");
    if (!(await canEnterWorkspace(userId, project.workspaceId))) {
      // 404, not 403 — don't disclose that a foreign project exists.
      throw new AppError("Project not found", 404, "NOT_FOUND");
    }
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
    // bug-110: `data.workspaceId || null` wrote NULL for a project created in
    // the caller's own workspace (no X-Workspace-Context is sent there), and
    // reads scope by `{ workspaceId }` — an equality NULL never matches. Same
    // fault as createShape/createGroup, same fix: resolve to the caller's own
    // workspace, verifying any claimed one server-side.
    const workspaceId = await resolveWorkspaceId(
      userId,
      data.workspaceId || null,
    );

    // Workspace-scoped: the caller must own the workspace or hold a seat in it.
    //
    // This used to ALSO require `team.findUnique({ id: workspaceId })` to
    // resolve — but `workspaceId` is a USER id since the owner-as-workspace
    // rename, so no team ever matched and every member got a hard
    // 404 "Team not found": creating a project inside a workspace was
    // impossible. The membership row it already fetched is the real answer, and
    // is exactly what `canEnterWorkspace` checks everywhere else.
    if (workspaceId && workspaceId !== userId) {
      const membership = await prisma.teamMember.findFirst({
        where: { workspaceId, userId },
        select: { id: true },
      });
      if (!membership) {
        throw new AppError(
          "You are not a member of this workspace",
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
        workspaceId,
        // `workspaceId` is now always set, so the old `workspaceId ? "team" :
        // appContext` would have forced every project to "team" and hidden Pro
        // projects from the Pro app (appScope matches "pro" exactly).
        appContext,
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

    // Locate the flow in any workspace the caller can enter. 404 only when the
    // flow truly isn't reachable — a workspace mismatch surfaces as 400 below
    // so the UI can explain it.
    const flow = await prisma.flow.findFirst({
      where: {
        id: flowId,
        deletedAt: null,
        workspaceId: { in: await accessibleWorkspaceIds(userId) },
      },
    });
    if (!flow) throw new AppError("Flow not found", 404, "NOT_FOUND");

    // Reject cross-team assignment. The workspaceId boundary (personal vs a
    // specific team) is the real workspace boundary — we intentionally do NOT
    // compare appContext, since a personal free-era flow and a personal
    // project created after upgrade legitimately differ in that legacy tag
    // (DATA-LOSS-001) yet both belong to the same personal workspace.
    if ((flow.workspaceId || null) !== (project.workspaceId || null)) {
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

    // Anyone inside the workspace may unassign — everything in a workspace is
    // shared, and getProjectById above already proved the caller belongs here.
    const flow = await prisma.flow.findFirst({
      where: {
        id: flowId,
        projectId,
        workspaceId: project.workspaceId,
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
