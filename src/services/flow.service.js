const { prisma } = require("../lib/prisma");
const produce = require("immer").produce;
const AppError = require("../utils/AppError");
const { personalFlowTeamOr } = require("../lib/personalFlowScope");
const notificationService = require("./notification.service");
const { getEntitlements } = require("./entitlements.service");

// Throttle window for collaborator-edit notifications: at most one "X edited
// your flow" per flow per editor within this window, so a save-heavy session
// produces a single clean action-log entry rather than a notification storm.
const FLOW_EDIT_NOTIFY_THROTTLE_MS = 10 * 60 * 1000;

class FlowService {
  // Strict workspace scoping (DATA-LOSS-001). ownerId always bounds the
  // query — never teamId alone, which would expose other members' rows.
  //   • Joined team context (teamId set) → only that team's flows.
  //   • Personal/own context (no teamId) → flows with NO team OR in a team
  //     the user OWNS. Owned teams have no switcher row (they fold into the
  //     personal context, see getMyContexts), so their flows must surface
  //     here — but flows created inside a JOINED team stay out of personal.
  // Returns a partial where-clause ({ teamId } or { AND: [...] }) to merge
  // into an ownerId-bounded query. Shared by getAllFlows and getFavorites.
  async _workspaceScope(userId, appContext, teamId) {
    if (teamId) {
      // If the header refers to the user's OWN team-app team, treat it as
      // personal context: show free flows (NULL) + that team's flows together.
      // Joined teams and pro-app teams get strict isolation (teamId only).
      const isOwnTeamAppTeam = await prisma.team.findFirst({
        where: {
          id: teamId,
          teamOwnerId: userId,
          // Free teams fold into the Team-App container (no standalone free
          // app shell): an owned team OR free header is personal context.
          appContext: { in: ["team", "free"] },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (isOwnTeamAppTeam) {
        // Personal context via own-team header: free + team flows.
        return { AND: [{ OR: [{ teamId: null }, { teamId }] }] };
      }
      return { teamId };
    }
    if (appContext === "pro") {
      // Pro user calling without X-Team-Context header. This is a race-condition
      // window: the frontend hasn't pinned vc_ai_billing_team yet (cleared
      // localStorage, first render before ProGuard runs, iOS WebView restart).
      // Defense-in-depth: never include teamId=null (free flows) for a Pro user.
      // Find their pro team and use strict isolation just like the header path.
      const proTeam = await prisma.team.findFirst({
        where: { teamOwnerId: userId, appContext: "pro", deletedAt: null },
        select: { id: true },
      });
      // Pro grant still in flight — return empty rather than leak free flows.
      return { teamId: proTeam ? proTeam.id : "__no_pro_team__" };
    }
    // Team/free user personal context = NULL-team flows + owned team-app AND
    // free teams (free folds into the Team-App container). Exclude pro-app
    // owned teams (appContext='pro') so pro flows never leak into the
    // team-app personal view (cross-app isolation).
    const ownedTeams = await prisma.team.findMany({
      where: {
        teamOwnerId: userId,
        appContext: { in: ["team", "free"] },
        deletedAt: null,
      },
      select: { id: true },
    });
    const ownedTeamIds = ownedTeams.map((t) => t.id);
    // Use AND (not OR) so callers don't clobber their own search OR.
    return {
      AND: [
        {
          OR: [
            { teamId: null },
            ...(ownedTeamIds.length ? [{ teamId: { in: ownedTeamIds } }] : []),
          ],
        },
      ],
    };
  }

  // Public wrapper so OTHER services (e.g. dashboard stats) reuse the EXACT
  // same workspace scope as the flows list — dashboard counts must never
  // diverge from what the user actually sees, and must never re-implement
  // scoping (DATA-LOSS-001). Returns the same partial where-clause as
  // _workspaceScope; merge it into an ownerId-bounded query.
  async resolveWorkspaceScope(userId, appContext, teamId) {
    return this._workspaceScope(userId, appContext, teamId);
  }

  async getAllFlows(userId, options = {}, appContext = "team") {
    const {
      search,
      page = 1,
      limit = 10,
      nonEmpty,
      teamId,
      sort,
      sortDirection,
      isFavorite,
      projectId,
    } = options;
    const sortField = ["updatedAt", "name", "createdAt"].includes(sort)
      ? sort
      : "updatedAt";
    const sortDir = sortDirection === "asc" ? "asc" : "desc";
    const take = Math.min(Number(limit) || 10, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    // §5 multi-tenant sandbox isolation: when the caller is a MEMBER of a team
    // (not the owner), flows are scoped by tenantOwner's ownerId + caller's
    // creatorId. Owner queries keep ownerId=userId (owns the whole namespace).
    let queryOwnerId = userId;
    if (teamId) {
      const team = await prisma.team.findFirst({
        where: { id: teamId, deletedAt: null },
        select: { teamOwnerId: true },
      });
      if (team && team.teamOwnerId !== userId) {
        queryOwnerId = team.teamOwnerId;
      }
    }

    const where = {
      ownerId: queryOwnerId,
      deletedAt: null,
      ...(await this._workspaceScope(userId, appContext, teamId)),
    };

    // Sandbox: members only see their own created flows within the tenant.
    if (queryOwnerId !== userId) {
      where.creatorId = userId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    if (isFavorite === true) {
      where.isFavorite = true;
    }

    if (projectId) {
      where.projectId = projectId;
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
        orderBy: { [sortField]: sortDir },
        include: {
          project: {
            select: { id: true, name: true },
          },
          creator: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: { flowShares: true },
          },
        },
      }),
      prisma.flow.count({ where }),
    ]);

    // Flatten project name, share count, and creator onto flow objects
    const flowsWithProject = flows.map((f) => ({
      ...f,
      projectName: f.project?.name || null,
      project: undefined,
      shareCount: f._count?.flowShares || 0,
      _count: undefined,
      accessType: "owner",
      createdByName: f.creator?.name || f.creator?.email || null,
      createdBySelf: !f.creatorId || f.creatorId === userId,
      creator: undefined,
    }));

    return {
      flows: flowsWithProject,
      total,
      page: Number(page) || 1,
      totalPages: Math.ceil(total / take),
    };
  }

  /**
   * Owner master view (§5 GAP-02): returns ALL flows whose ownerId = userId
   * inside the given teamId, including member-created ones (creatorId ≠ userId).
   * Only the tenant owner should call this — scope enforcement is in the controller.
   */
  async getOwnerMasterFlows(userId, teamId) {
    const where = {
      ownerId: userId,
      teamId: teamId || null,
      deletedAt: null,
    };
    const flows = await prisma.flow.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        project: {
          select: { id: true, name: true },
        },
      },
    });
    return flows.map((f) => ({
      ...f,
      projectName: f.project?.name || null,
      project: undefined,
      createdByName: f.creator?.name || f.creator?.email || null,
      createdBySelf: !f.creatorId || f.creatorId === userId,
      creator: undefined,
    }));
  }

  async getFlowById(id, userId, appContext = null, teamId = null) {
    const scopeWhere = appContext
      ? await this._workspaceScope(userId, appContext, teamId)
      : {};
    return await prisma.flow.findFirst({
      where: { id, ownerId: userId, ...scopeWhere },
    });
  }

  async createFlow(userId, data, appContext) {
    let teamId = data.teamId || null;
    // §5 multi-tenant: ownerId follows the tenant owner so member-created flows
    // land in the tenant namespace (ownerId=tenantOwner, creatorId=member).
    // Set inside the teamId block once the team row is fetched.
    let resolvedOwnerId = userId;

    // Pro users have a personal Pro workspace backed by their own Pro team.
    // When no explicit team context is supplied, route the flow into that Pro
    // team so Pro flows carry a teamId (isolated from free flows) and an
    // appContext of 'pro'. Falls back to a NULL-team personal flow if the Pro
    // team is missing (e.g. grant not yet completed).
    if (!teamId && appContext === "pro") {
      const proTeam = await prisma.team.findFirst({
        where: { teamOwnerId: userId, appContext: "pro", deletedAt: null },
        select: { id: true },
      });
      if (proTeam) teamId = proTeam.id;
    }

    // The flow's appContext is defined by the workspace it lives in (captured
    // from the team below). A Pro team tags flows 'pro'; any other team tags
    // 'team'; a personal flow keeps the caller's currentVersion.
    let workspaceAppContext = null;

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
              proAdditionalFlowsPurchased: true,
            },
          },
        },
      });
      if (!team || team.deletedAt) {
        throw new AppError("Team not found", 404, "NOT_FOUND");
      }
      workspaceAppContext = team.appContext;
      // §5 tenant ownership: ownerId on the flow is always the tenant owner's
      // ID so all team flows share the same ownerId namespace regardless of who
      // created them. creatorId captures the actual member (resolvedOwnerId is
      // set here and used in the prisma.flow.create call below).
      resolvedOwnerId = team.teamOwnerId;
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
      // Team-app workspaces get unlimited flows. workspaceAppContext is the
      // team's DB-stored appContext (NOT the spoofable X-App-Context header),
      // and membership was already verified above — so this signal is
      // server-trusted (see checkTeamAccess APP_CONTEXT_MISMATCH guard).
      if (workspaceAppContext !== "team" && !team.owner.proUnlimitedFlows) {
        // Base allowance plus one-time flow packs (System A) — keeps
        // enforcement in sync with getPackStatus/getProSubscriptionStatus.
        const effectiveLimit =
          (team.owner.proFlowLimit || 10) +
          (team.owner.proAdditionalFlowsPurchased || 0);
        const count = await prisma.flow.count({
          where: { teamId, deletedAt: null },
        });
        if (count >= effectiveLimit) {
          throw new AppError(
            `Team flow limit reached (${effectiveLimit}). Upgrade the team plan to create more flows.`,
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
          proAdditionalFlowsPurchased: true,
          teamFlowLimit: true,
          teamUnlimitedFlows: true,
        },
      });
      if (user) {
        // Workspace-context-aware effective limit (FEAT-001). A null limit
        // means unlimited → skip enforcement entirely.
        //   • Team context  → use the user's team-flow allowance.
        //   • Pro/other     → existing Pro allowance + flow-pack logic
        //                      (unchanged).
        let effectiveLimit = null;
        if (appContext === "team") {
          if (!user.teamUnlimitedFlows) {
            effectiveLimit = user.teamFlowLimit || 50;
          }
        } else if (!user.proUnlimitedFlows) {
          // Base allowance plus one-time flow packs (System A) — keeps
          // enforcement in sync with getPackStatus/getProSubscriptionStatus.
          effectiveLimit =
            (user.proFlowLimit || 10) + (user.proAdditionalFlowsPurchased || 0);
        }
        if (effectiveLimit !== null) {
          // Count ALL personal flows against the limit, not just the current
          // tier's — the cap is per-user, not per-appContext (see DATA-LOSS-001).
          // Unified scope: personalFlowTeamOr (teamId=null + owned teams) is
          // the single definition used by getPackStatus, the expiry cron, and
          // the add-on cancellation handler — Pro flows live in the owner's
          // Pro team, so teamId:null alone undercounts (FLOWPACK Gap #4).
          const count = await prisma.flow.count({
            where: {
              ownerId: userId,
              deletedAt: null,
              OR: await personalFlowTeamOr(userId),
            },
          });
          if (count >= effectiveLimit) {
            throw new AppError(
              `Flow limit reached (${effectiveLimit}). Upgrade to create more flows.`,
              403,
              "FLOW_LIMIT_REACHED",
            );
          }
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
        // §5: ownerId = tenantOwner for team flows, userId for personal.
        // creatorId always = the actual creator (userId).
        ownerId: resolvedOwnerId,
        creatorId: userId,
        projectId: data.projectId || null,
        teamId,
        // Workspace-derived appContext: a Pro team tags flows 'pro' (so the Pro
        // app can isolate them); any other team tags 'team'; personal flows
        // keep the caller's currentVersion.
        appContext: teamId
          ? workspaceAppContext === "pro"
            ? "pro"
            : "team"
          : appContext,
      },
    });
  }

  async updateFlow(id, userId, data, createVersion = false) {
    // FEAT-002: version snapshots are now manual-save-only. The flag can be
    // passed explicitly OR ride along in the request body (controller forwards
    // req.body verbatim as `data`), so both call paths are supported.
    if (data && data.createVersion) createVersion = true;
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
      data: { ...updateData, lastModifiedById: userId }, // record acting owner
    });

    // Create a version snapshot on a MANUAL save whose diagramData changed.
    // Autosaves (createVersion=false) update the flow but never snapshot.
    if (
      createVersion &&
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
        // Retain the newest N per the flow OWNER's tier (free 10 / pro 50 /
        // team 100); prune the rest.
        const entitlements = await getEntitlements(flow.ownerId);
        const versionLimit = entitlements.limits.versionLimit || 20;
        const all = await prisma.flowVersion.findMany({
          where: { flowId: id },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (all.length > versionLimit) {
          const oldIds = all.slice(versionLimit).map((v) => v.id);
          await prisma.flowVersion.deleteMany({
            where: { id: { in: oldIds } },
          });
        }
      } catch (e) {
        console.error("FlowVersion snapshot failed:", e.message);
      }

      // P1 collaboration trigger: notify the flow owner that a collaborator
      // edited their flow (throttled to one entry per flow/editor per window).
      //
      // NOTE: updateFlow is currently owner-scoped (`ownerId: userId` above),
      // so `flow.ownerId === userId` always holds and this branch is dormant —
      // it fires the instant a collaborator-edit path is enabled (i.e. when
      // the update is allowed to resolve a team-mate's flow). It is guarded so
      // it can never notify the editor about their own edit. Do NOT relax the
      // ownerId binding to activate this without isolation sign-off
      // (DATA-LOSS-001).
      await this._notifyOwnerOfCollaboratorEdit(flow, userId).catch(() => {});
    }

    return updated;
  }

  async _notifyOwnerOfCollaboratorEdit(flow, editorId) {
    if (!flow?.ownerId || flow.ownerId === editorId) return; // own edit — skip

    // Throttle: skip if we already logged an edit for this flow within window.
    const since = new Date(Date.now() - FLOW_EDIT_NOTIFY_THROTTLE_MS);
    const recent = await prisma.notification.findFirst({
      where: {
        userId: flow.ownerId,
        type: "flow_updated",
        createdAt: { gte: since },
        metadata: { path: ["flowId"], equals: flow.id },
      },
      select: { id: true },
    });
    if (recent) return;

    const editor = await prisma.user.findUnique({
      where: { id: editorId },
      select: { name: true, email: true },
    });

    await notificationService.createNotification(
      flow.ownerId,
      "flow_updated",
      "Flow updated",
      `${editor?.name || editor?.email || "A collaborator"} edited "${
        flow.name || "your flow"
      }".`,
      `/dashboard/flows/${flow.id}`,
      { flowId: flow.id, flowName: flow.name || null, editedBy: editorId },
      flow.appContext || "team", // appContext
      flow.teamId || null, // scope to the flow's workspace
    );
  }

  async deleteFlow(id, userId) {
    const flow = await prisma.flow.findFirst({
      where: { id, deletedAt: null },
    });
    if (!flow) throw new AppError("Flow not found", 404, "NOT_FOUND");

    // Owner can always delete
    if (flow.ownerId === userId) {
      return await prisma.flow.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    }

    // §5 multi-tenant: creator (member) can delete their own flow
    if (flow.creatorId === userId && flow.teamId) {
      const membership = await prisma.teamMember.findFirst({
        where: { teamId: flow.teamId, userId, team: { deletedAt: null } },
        select: { id: true },
      });
      if (membership) {
        return await prisma.flow.update({
          where: { id },
          data: { deletedAt: new Date() },
        });
      }
    }

    throw new AppError("Flow not found", 404, "NOT_FOUND");
  }

  async getTrash(userId, options = {}, appContext = "team", teamId = null) {
    const { page = 1, limit = 20 } = options;
    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const where = { ownerId: userId, deletedAt: { not: null } };

    // Scope trash to the active workspace — same logic as getAllFlows.
    if (teamId) {
      const isOwnTeamAppTeam = await prisma.team.findFirst({
        where: {
          id: teamId,
          teamOwnerId: userId,
          // Free teams fold into the Team-App container (no standalone free
          // app shell): an owned team OR free header is personal context.
          appContext: { in: ["team", "free"] },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (isOwnTeamAppTeam) {
        where.AND = [{ OR: [{ teamId: null }, { teamId }] }];
      } else {
        where.teamId = teamId;
      }
    } else if (appContext === "pro") {
      const proTeam = await prisma.team.findFirst({
        where: { teamOwnerId: userId, appContext: "pro", deletedAt: null },
        select: { id: true },
      });
      where.teamId = proTeam ? proTeam.id : "__no_pro_team__";
    } else {
      const ownedTeams = await prisma.team.findMany({
        where: {
          teamOwnerId: userId,
          appContext: { in: ["team", "free"] },
          deletedAt: null,
        },
        select: { id: true },
      });
      const ownedTeamIds = ownedTeams.map((t) => t.id);
      where.AND = [
        {
          OR: [
            { teamId: null },
            ...(ownedTeamIds.length ? [{ teamId: { in: ownedTeamIds } }] : []),
          ],
        },
      ];
    }

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

  // FEAT-003: Restore a flow to a prior version WITHOUT losing the current
  // state. Snapshots the live diagram first (so a restore is always undoable),
  // overwrites the flow with the chosen version's XML, then records the
  // restored XML as the new latest version. Both snapshots count toward the
  // owner's tier version limit and are pruned together. Atomic via $transaction.
  async restoreFlowVersion(flowId, versionId, userId) {
    // 1. Ownership check — only the owner may restore (mirrors updateFlow).
    const flow = await prisma.flow.findFirst({
      where: { id: flowId, ownerId: userId, deletedAt: null },
    });
    if (!flow)
      throw new AppError("Access denied or flow not found", 403, "FORBIDDEN");

    // 2. Load the target version.
    const version = await prisma.flowVersion.findFirst({
      where: { id: versionId, flowId },
    });
    if (!version) throw new AppError("Version not found", 404, "NOT_FOUND");

    // Resolve the owner's tier version cap up front (read-only).
    const entitlements = await getEntitlements(flow.ownerId);
    const versionLimit = entitlements.limits.versionLimit || 20;

    // 3-6. Snapshot current → overwrite → snapshot restored → prune, atomically.
    return await prisma.$transaction(async (tx) => {
      // 3. Snapshot the CURRENT (pre-restore) state so the restore is undoable.
      //    Skip only if the flow has no diagram yet (xml is a required column).
      if (flow.diagramData) {
        await tx.flowVersion.create({
          data: {
            flowId,
            xml: flow.diagramData,
            savedById: userId,
            thumbnail: flow.thumbnail || null,
          },
        });
      }

      // 4. Overwrite the live flow with the chosen version's XML.
      const updated = await tx.flow.update({
        where: { id: flowId },
        data: {
          diagramData: version.xml,
          thumbnail: version.thumbnail ?? flow.thumbnail,
          lastModifiedById: userId,
          updatedAt: new Date(),
        },
      });

      // 5. Record the restored XML as the new latest version.
      await tx.flowVersion.create({
        data: {
          flowId,
          xml: version.xml,
          savedById: userId,
          thumbnail: version.thumbnail || null,
        },
      });

      // 6. Prune to the owner's tier limit — keep newest N, delete the rest.
      const all = await tx.flowVersion.findMany({
        where: { flowId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (all.length > versionLimit) {
        const oldIds = all.slice(versionLimit).map((v) => v.id);
        await tx.flowVersion.deleteMany({ where: { id: { in: oldIds } } });
      }

      return {
        message: "Flow restored to selected version",
        flowId,
        restoredFromVersionId: versionId,
        diagramData: updated.diagramData,
        totalVersions: Math.min(all.length, versionLimit),
      };
    });
  }

  async permanentDeleteFlow(id, userId) {
    const result = await prisma.flow.deleteMany({
      where: { id, ownerId: userId, deletedAt: { not: null } },
    });
    if (result.count === 0)
      throw new AppError("Flow not found in trash", 404, "NOT_FOUND");
    return result;
  }

  async emptyTrash(userId) {
    // Hard-delete every soft-deleted flow the user owns. Scoped by ownerId to
    // mirror getTrash() — never a WHERE-less wipe.
    return await prisma.flow.deleteMany({
      where: { ownerId: userId, deletedAt: { not: null } },
    });
  }

  async purgeOldTrash(daysOld = 30) {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    return await prisma.flow.deleteMany({
      where: { deletedAt: { not: null, lt: cutoff } },
    });
  }

  async getFavorites(userId, appContext = "team", teamId = null) {
    // Workspace-scoped (DATA-LOSS-001): favorites must follow the active
    // context like every other personal-data list — previously this returned
    // ALL of the user's favorites across personal + every team workspace.
    return await prisma.flow.findMany({
      where: {
        ownerId: userId,
        isFavorite: true,
        deletedAt: null,
        ...(await this._workspaceScope(userId, appContext, teamId)),
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, thumbnail: true },
    });
  }

  async duplicateFlow(id, userId, appContext = "team") {
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

  async shareFlow(flowId, userId, shares, appContext = "team") {
    // Verify flow belongs to current user — either as tenant owner or as the
    // member who created it under a tenant namespace (ownerId = tenant owner,
    // creatorId = this member).
    const flow = await prisma.flow.findFirst({
      where: {
        id: flowId,
        deletedAt: null,
        OR: [{ ownerId: userId }, { creatorId: userId }],
      },
    });
    if (!flow)
      throw new AppError(
        "Flow not found or not owned by you",
        404,
        "NOT_FOUND",
      );

    // Fetch sharer info once (used for email/FCM and Pro check).
    // isProUser is TRUE only for standalone Pro (currentVersion='pro').
    // Team users (currentVersion='team') share via team membership; they must
    // not bypass the team-member check via email-based sharing.
    const sharerUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        hasPro: true,
        proPurchasedAt: true,
        currentVersion: true,
      },
    });
    const isProUser =
      sharerUser?.hasPro === true &&
      sharerUser?.proPurchasedAt !== null &&
      sharerUser?.currentVersion === "pro";

    // Non-Pro users: restrict to team members only
    let validTeamIds = null;
    if (!isProUser) {
      const teamMembers = await prisma.teamMember.findMany({
        where: { userId },
        select: { teamId: true },
      });
      const teamIds = teamMembers.map((tm) => tm.teamId);
      const validMembers = await prisma.teamMember.findMany({
        where: { teamId: { in: teamIds }, userId: { not: userId } },
        select: { userId: true },
      });
      validTeamIds = new Set(validMembers.map((m) => m.userId));
    }

    const APP_URL =
      process.env.NEXTAUTH_URL ||
      process.env.APP_URL ||
      "http://localhost:3002";

    const results = [];
    for (const share of shares) {
      let recipientId = share.userId || null;
      let recipientEmail = null;

      // Resolve email → userId (Pro users can share by email)
      if (!recipientId && share.email) {
        const found = await prisma.user.findUnique({
          where: { email: share.email.toLowerCase().trim() },
          select: { id: true, email: true },
        });
        if (!found) {
          results.push({ email: share.email, error: "USER_NOT_FOUND" });
          continue;
        }
        recipientId = found.id;
        recipientEmail = found.email;
      }

      if (!recipientId) {
        results.push({ error: "userId or email is required" });
        continue;
      }

      if (recipientId === userId) {
        results.push({
          userId: recipientId,
          error: "Cannot share with yourself",
        });
        continue;
      }

      // Non-Pro: enforce team membership
      if (!isProUser && !validTeamIds.has(recipientId)) {
        results.push({
          userId: recipientId,
          error: "User is not a team member",
        });
        continue;
      }

      // Fetch recipient to determine if Pro-gate is needed
      let recipientUser = null;
      try {
        recipientUser = await prisma.user.findUnique({
          where: { id: recipientId },
          select: { email: true, hasPro: true },
        });
        if (!recipientEmail) recipientEmail = recipientUser?.email || null;
      } catch (_) {
        // non-fatal — proceed without Pro check
      }

      // requiresPro: sharer is standalone Pro AND recipient does not have Pro
      const requiresPro = isProUser && !recipientUser?.hasPro;

      try {
        await prisma.flowShare.upsert({
          where: {
            flowId_sharedWithId: { flowId, sharedWithId: recipientId },
          },
          create: {
            flowId,
            sharedById: userId,
            sharedWithId: recipientId,
            permission: share.permission,
            appContext,
            requiresPro,
          },
          update: { permission: share.permission, requiresPro },
        });
        results.push({
          userId: recipientId,
          permission: share.permission,
          requiresPro,
          success: true,
        });

        // Email notification
        try {
          if (recipientEmail) {
            const {
              sendFlowShareEmail,
              sendFlowShareProRequiredEmail,
            } = require("../utils/email");
            if (requiresPro) {
              await sendFlowShareProRequiredEmail({
                to: recipientEmail,
                sharerName: sharerUser?.name || "Someone",
                flowName: flow.name,
                upgradeUrl: `${APP_URL}/dashboard/subscription`,
              });
            } else {
              await sendFlowShareEmail({
                to: recipientEmail,
                sharerName: sharerUser?.name || "Someone",
                flowName: flow.name,
                flowUrl: `${APP_URL}/dashboard/flows/${flowId}`,
                permission: share.permission,
              });
            }
          }
        } catch (emailErr) {
          console.error("[Email share notify] failed:", emailErr.message);
        }

        // FCM push notification — never break share on failure
        try {
          const fcm = require("./fcm.service");
          await fcm.sendToUser(
            recipientId,
            requiresPro ? "Flow Shared — Pro Required" : "Flow Shared With You",
            requiresPro
              ? `${sharerUser?.name || "Someone"} shared "${flow.name}" — upgrade to Pro to access`
              : `${sharerUser?.name || "Someone"} shared "${flow.name}" with you`,
            { type: "flow_share", flowId, requiresPro },
          );
        } catch (fcmErr) {
          console.error("[FCM share notify] failed:", fcmErr.message);
        }
      } catch (err) {
        results.push({ userId: recipientId, error: err.message });
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

    // Allow: tenant owner, flow creator (member working under tenant), or a recipient
    const isOwnerOrCreator =
      flow.ownerId === userId || flow.creatorId === userId;
    if (!isOwnerOrCreator) {
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
    // isProUser is TRUE only for standalone Pro accounts (currentVersion='pro').
    // Team-plan users (currentVersion='team') also have hasPro=true but they
    // already share through team membership — they must NOT see the Pro badge
    // or the free-form email input, which is a Pro-only feature.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { hasPro: true, proPurchasedAt: true, currentVersion: true },
    });
    const isProUser =
      user?.hasPro === true &&
      user?.proPurchasedAt !== null &&
      user?.currentVersion === "pro";

    // Get all team members across all user's teams (deduplicated)
    const teamMembers = await prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const teamIds = teamMembers.map((tm) => tm.teamId);

    const seen = new Set();
    const unique = [];

    if (teamIds.length > 0) {
      const members = await prisma.teamMember.findMany({
        where: { teamId: { in: teamIds }, userId: { not: userId } },
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      });
      for (const m of members) {
        if (!seen.has(m.userId)) {
          seen.add(m.userId);
          unique.push(m.user);
        }
      }
    }

    return { members: unique, isProUser };
  }

  async getSharedFlows(userId, appContext = "team", activeTeamId = null) {
    // Resolve which team owners can deliver shares to this user.
    // - Team context: only the active team's owner (strict workspace isolation).
    // - Personal context (no team selected): show shares from ANY team owner
    //   the user belongs to, so new users with empty localStorage still see
    //   their incoming shares before the workspace switcher reconciles.
    let sharedByFilter;
    if (activeTeamId) {
      const team = await prisma.team.findFirst({
        where: { id: activeTeamId, deletedAt: null },
        select: { teamOwnerId: true },
      });
      if (!team) return [];
      sharedByFilter = { sharedById: team.teamOwnerId };
    } else {
      // Personal context — collect owners of every team the user is a member of.
      const memberships = await prisma.teamMember.findMany({
        where: { userId, team: { deletedAt: null } },
        select: { team: { select: { teamOwnerId: true } } },
      });
      const ownerIds = [
        ...new Set(
          (Array.isArray(memberships) ? memberships : []).map(
            (m) => m.team.teamOwnerId,
          ),
        ),
      ];
      if (!ownerIds.length) return [];
      sharedByFilter = { sharedById: { in: ownerIds } };
    }

    const shares = await prisma.flowShare.findMany({
      where: {
        sharedWithId: userId,
        ...sharedByFilter,
        appContext,
        // Double-anchor: the share record AND the underlying flow must both
        // carry the same appContext so a Pro flow never leaks into a Team
        // viewport and vice-versa.
        flow: { deletedAt: null, appContext },
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

  async getFlowByIdWithAccess(id, userId, appContext = null, teamId = null) {
    const flow = await prisma.flow.findFirst({
      where: { id, deletedAt: null },
    });
    if (!flow) return null;

    // Owner path — enforce appContext workspace scope when context is known.
    // A Pro flow cannot be opened from a Team context and vice-versa.
    if (flow.ownerId === userId) {
      if (appContext) {
        const scopeWhere = await this._workspaceScope(
          userId,
          appContext,
          teamId,
        );
        const inScope = await prisma.flow.findFirst({
          where: { id, ownerId: userId, ...scopeWhere },
          select: { id: true },
        });
        if (!inScope) {
          // Flow exists but lives outside the active workspace context.
          throw new AppError(
            "Flow not found in current app context",
            404,
            "NOT_FOUND",
          );
        }
      }
      return { ...flow, permission: "owner" };
    }

    // §5 multi-tenant member path: the caller created this flow under a tenant
    // owner's namespace (ownerId=tenantOwner, creatorId=caller). Verify active
    // membership before granting owner-level access.
    if (flow.creatorId === userId && flow.teamId) {
      const membership = await prisma.teamMember.findFirst({
        where: { teamId: flow.teamId, userId, team: { deletedAt: null } },
        select: { id: true },
      });
      if (membership) {
        return { ...flow, permission: "owner" };
      }
    }

    // Shared path — shares are tagged with the appContext they were created in.
    // Allow null-appContext shares through (legacy records predating the field)
    // but strictly block cross-context shares (pro share ≠ team context).
    const shareWhere = {
      flowId: id,
      sharedWithId: userId,
      ...(appContext ? { OR: [{ appContext }, { appContext: null }] } : {}),
    };
    const share = await prisma.flowShare.findFirst({ where: shareWhere });
    if (share) {
      if (share.requiresPro) {
        const recipient = await prisma.user.findUnique({
          where: { id: userId },
          select: { hasPro: true },
        });
        if (!recipient?.hasPro) {
          throw new AppError(
            "This flow was shared with you by a Pro user. Please upgrade to Pro to access it.",
            402,
            "PRO_REQUIRED",
          );
        }
      }
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

    // §5 multi-tenant: creator (member) can edit their own flow
    if (flow.creatorId === userId && flow.teamId) {
      const membership = await prisma.teamMember.findFirst({
        where: { teamId: flow.teamId, userId, team: { deletedAt: null } },
        select: { id: true },
      });
      if (membership) return await this.updateFlow(id, flow.ownerId, data);
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

    if (share.requiresPro) {
      const recipient = await prisma.user.findUnique({
        where: { id: userId },
        select: { hasPro: true },
      });
      if (!recipient?.hasPro) {
        throw new AppError(
          "This flow was shared with you by a Pro user. Please upgrade to Pro to access it.",
          402,
          "PRO_REQUIRED",
        );
      }
    }

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
      data: { ...updateData, lastModifiedById: userId }, // record acting collaborator/owner
    });

    // Capture a version snapshot for shared-edit MANUAL saves, exactly like
    // updateFlow does on the owner path. Autosaves (createVersion absent/false)
    // update the flow but never snapshot. Without this, manual edits by team
    // members never appeared in the version-history drawer, so "who
    // changed what, when" was unanswerable for collaborative flows.
    if (
      data.createVersion &&
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
        // Retain the newest N per the flow OWNER's tier (free 10 / pro 50 /
        // team 100); prune the rest.
        const entitlements = await getEntitlements(flow.ownerId);
        const versionLimit = entitlements.limits.versionLimit || 20;
        const all = await prisma.flowVersion.findMany({
          where: { flowId: id },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (all.length > versionLimit) {
          const oldIds = all.slice(versionLimit).map((v) => v.id);
          await prisma.flowVersion.deleteMany({
            where: { id: { in: oldIds } },
          });
        }
      } catch (e) {
        console.error("FlowVersion snapshot failed (shared edit):", e.message);
      }

      // P1 collaboration triggers on the LIVE co-edit path. updateFlow (the
      // owner-only primitive) keeps its ownerId binding untouched per
      // DATA-LOSS-001; the collaborator-edit side-effects belong here, where
      // access has already been verified (owner OR FlowShare edit).
      //
      // Both helpers self-guard against owner==editor, so the owner editing
      // their own flow produces neither a notification nor an audit row.
      // createNotification() emits over Socket.IO to room user:<ownerId>
      // automatically, satisfying the real-time requirement with no extra
      // socket plumbing. Best-effort — a notify/audit failure must never roll
      // back a persisted edit.
      await this._notifyOwnerOfCollaboratorEdit(flow, userId).catch(() => {});
      await this._auditCollaboratorEdit(flow, userId).catch(() => {});
    }

    return updated;
  }

  // Immutable audit row: "{editor} edited shared flow {flow} owned by {owner}
  // (Version #n)". Skipped for self-edits — an owner editing their own flow is
  // not a collaboration event. Never throws into the caller (best-effort).
  async _auditCollaboratorEdit(flow, editorId) {
    if (!flow?.ownerId || flow.ownerId === editorId) return;

    const [editor, owner, versionCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: editorId },
        select: { name: true, email: true },
      }),
      prisma.user.findUnique({
        where: { id: flow.ownerId },
        select: { name: true, email: true },
      }),
      prisma.flowVersion.count({ where: { flowId: flow.id } }),
    ]);
    const editorName = editor?.name || editor?.email || "A collaborator";
    const ownerName = owner?.name || owner?.email || "the owner";

    await prisma.userAction.create({
      data: {
        action: "flow_collaborator_edit",
        actionModel: "Flow",
        userId: editorId, // the actor — never the owner
        appContext: flow.appContext || "team",
        details: {
          message: `${editorName} edited shared flow "${
            flow.name || "Untitled"
          }" owned by ${ownerName} (Version #${versionCount})`,
          flowId: flow.id,
          ownerId: flow.ownerId,
          editorId,
          version: versionCount,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async duplicateSharedFlow(id, userId, appContext = "team") {
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
  // teamPicker=true scopes to team flows (the team-subscription-expired
  // picker) instead of personal Pro flows.
  async getPickerList(userId, teamPicker = false) {
    const scopeOr = teamPicker
      ? [{ teamId: null, appContext: "team" }]
      : await personalFlowTeamOr(userId);
    const flows = await prisma.flow.findMany({
      where: {
        ownerId: userId,
        // Personal workspace = teamId null OR a team the user owns (their Pro
        // team folds into personal). Nest both OR-clauses under AND so they
        // don't collide.
        AND: [
          { OR: scopeOr },
          // Include both active and currently-marked-for-downgrade flows so
          // the user can see what's at risk and pick from everything.
          { OR: [{ deletedAt: null }, { markedForDowngrade: true }] },
        ],
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

  // Confirm the user's flow selection. Trashes everything else.
  // teamPicker=true → team-subscription picker: keep up to 50 team flows.
  async confirmSelection(userId, selectedIds, teamPicker = false) {
    if (!Array.isArray(selectedIds)) {
      throw new AppError(
        "selectedFlowIds must be an array",
        400,
        "VALIDATION_ERROR",
      );
    }
    const maxKeep = teamPicker ? 50 : 10;
    if (selectedIds.length > maxKeep) {
      throw new AppError(
        `You can keep at most ${maxKeep} flows`,
        400,
        "TOO_MANY",
      );
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isInFlowPickerPhase: true, isInTeamPickerPhase: true },
    });
    const inPhase = teamPicker
      ? user?.isInTeamPickerPhase
      : user?.isInFlowPickerPhase;
    if (!inPhase) {
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

    const scopeOr = teamPicker
      ? [{ teamId: null, appContext: "team" }]
      : await personalFlowTeamOr(userId);
    const allPersonal = await prisma.flow.findMany({
      where: { ownerId: userId, OR: scopeOr },
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
        data: teamPicker
          ? {
              isInTeamPickerPhase: false,
              teamFlowLimit: 50,
            }
          : {
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
  async getPackStatus(userId, teamId = null) {
    // §5: if the caller is a member inside a paid tenant, resolve limits from
    // the tenant owner (same logic as getEntitlements inheritance).
    let resolvedUserId = userId;
    if (teamId) {
      try {
        const team = await prisma.team.findFirst({
          where: { id: teamId, deletedAt: null },
          select: { teamOwnerId: true },
        });
        if (team && team.teamOwnerId !== userId) {
          resolvedUserId = team.teamOwnerId;
        }
      } catch {
        /* fall back to caller */
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: resolvedUserId },
      select: {
        proFlowLimit: true,
        proAdditionalFlowsPurchased: true,
        proUnlimitedFlows: true,
        flowAddonStatus: true,
        flowAddonPlan: true,
        activeFlowPackId: true,
        flowPackExpiresAt: true,
        isInFlowPickerPhase: true,
        isInTeamPickerPhase: true,
        teamFlowLimit: true,
        teamUnlimitedFlows: true,
        subscription: { select: { status: true, productType: true } },
      },
    });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");

    // §5 B5: if the resolved user has an active team subscription, treat them
    // as having unlimited team flows — even if the DB flag wasn't backfilled.
    // "cancelling" = cancel-at-period-end (Stripe); user retains full access
    // until the period ends, so it counts the same as "active".
    const hasActiveTeamSub =
      (user.subscription?.status === "active" ||
        user.subscription?.status === "cancelling") &&
      (user.subscription?.productType?.includes("team") ||
        user.subscription?.productType?.includes("Team"));
    const effectiveTeamUnlimited = user.teamUnlimitedFlows || hasActiveTeamSub;

    const activePack = user.activeFlowPackId
      ? await prisma.proFlowPurchase.findUnique({
          where: { id: user.activeFlowPackId },
        })
      : null;

    // When a specific team context is active (Pro app), count only flows in
    // that team — matches exactly what the user sees in the flow list.
    // Without a teamId (free/personal context), fall back to personalFlowTeamOr
    // so legacy personal flows (teamId=null) are still counted.
    const flowCount = await prisma.flow.count({
      where: {
        ownerId: resolvedUserId,
        deletedAt: null,
        ...(teamId
          ? { teamId }
          : { OR: await personalFlowTeamOr(resolvedUserId) }),
      },
    });

    const isAddonUnlimited =
      user.flowAddonStatus === "active" && user.flowAddonPlan === "unlimited";
    const limit =
      user.proUnlimitedFlows || isAddonUnlimited
        ? -1
        : user.flowAddonStatus === "active" &&
            user.flowAddonPlan === "standard_100"
          ? 100
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
      isInTeamPickerPhase: user.isInTeamPickerPhase || false,
      teamFlowLimit: user.teamFlowLimit || 50,
      teamUnlimitedFlows: effectiveTeamUnlimited,
      daysUntilExpiry,
    };
  }
}

module.exports = new FlowService();
