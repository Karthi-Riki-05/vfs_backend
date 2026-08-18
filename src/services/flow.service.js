const { prisma } = require("../lib/prisma");
const {
  workspaceScope,
  resolveWorkspaceId,
  canEnterWorkspace,
  appScope,
} = require("../lib/workspaceScope");
const produce = require("immer").produce;
const AppError = require("../utils/AppError");
const notificationService = require("./notification.service");
const { getEntitlements } = require("./entitlements.service");

// Throttle window for collaborator-edit notifications: at most one "X edited
// your flow" per flow per editor within this window, so a save-heavy session
// produces a single clean action-log entry rather than a notification storm.
const FLOW_EDIT_NOTIFY_THROTTLE_MS = 10 * 60 * 1000;

// How many recipient faces the flows list carries per flow. The card stacks
// avatars and shows "+N" for the remainder using shareCount, so this bounds
// the payload without hiding the true breadth of a share.
const SHARE_FACE_LIMIT = 4;

class FlowService {
  // Workspace scoping — the workspace IS the tenant owner (owner decision
  // 2026-08-07). `workspaceId` on a flow holds a USER id, so scoping is one
  // equality; the old OR over owned-team ids is gone, and so is the
  // NULL-means-personal rule that let bug-094 re-home deleted teams' content.
  //
  // The requested workspace arrives on X-Workspace-Context — a CLIENT claim.
  // resolveWorkspaceId verifies membership server-side and falls back to the
  // caller's own workspace, so a forged header grants nothing (DATA-LOSS-001).
  async _workspaceScope(userId, appContext, requestedWorkspaceId) {
    return await workspaceScope(userId, requestedWorkspaceId, appContext);
  }

  // Public wrapper so OTHER services (e.g. dashboard stats) reuse the EXACT
  // same workspace scope as the flows list — dashboard counts must never
  // diverge from what the user actually sees, and must never re-implement
  // scoping (DATA-LOSS-001).
  /**
   * The scope for LISTING flows — the workspace boundary plus the owner/member
   * visibility rule.
   *
   * Owner decision (2026-08-08, REVISED): this scope is now "flows **I**
   * created", for everyone — member and workspace owner alike. `creatorId` is
   * pinned to the caller unconditionally.
   *
   * The previous rule (2026-08-07) let the workspace OWNER see members' flows
   * mixed into this same list, which made "My Flows" a misnomer for the one
   * person who had the most flows in it and gave the owner no way to tell the
   * two apart beyond a badge. Members' flows now live in their own place — see
   * `getOwnerMasterFlows` (the MASTER FLOWS panel), which is the exact
   * complement of this scope: same workspace, same app, `creatorId ≠ caller`.
   * Together the two lists still cover every flow in the workspace exactly
   * once, so nothing became unreachable — it moved.
   *
   * This is the single source for both the flows list and the dashboard counts
   * — if the two used different rules the dashboard would count flows the list
   * refuses to show (DASH-P17 locks them equal). Narrowing here therefore also
   * narrows the dashboard: an owner's "total flows" now counts what "My Flows"
   * shows, which is the point of keeping them equal. Plan-limit counting is
   * NOT affected — `getPackStatus` counts the whole workspace off the raw
   * `{workspaceId, appScope}` and never goes through here, so a member's flow
   * still consumes the owner's quota.
   *
   * Deliberately NOT folded into `_workspaceScope`: that fragment also governs
   * opening, updating and limit-counting a flow, and narrowing all of those by
   * creator would change far more than visibility.
   */
  async resolveWorkspaceScope(userId, appContext, requestedWorkspaceId) {
    const scope = await this._workspaceScope(
      userId,
      appContext,
      requestedWorkspaceId,
    );
    // Unconditional, no owner branch: "mine" means mine in every workspace,
    // including your own. A scalar equality (not an OR) on purpose — callers
    // merge this fragment into a `where` that already owns `OR` for search, so
    // an OR here would be silently overwritten by the next assignment.
    //
    // `creatorId` is nullable in the schema (legacy rows predating attribution)
    // and a null would be excluded by this equality. Verified 0 null rows, and
    // createFlow has always stamped the creator; if a backfill ever reintroduces
    // them, attribute them to the workspace owner rather than loosening this.
    scope.creatorId = userId;
    return scope;
  }

  async getAllFlows(userId, options = {}, appContext = "team") {
    const {
      search,
      page = 1,
      limit = 10,
      nonEmpty,
      sort,
      sortDirection,
      isFavorite,
      projectId,
    } = options;
    // Accept BOTH names. flow.controller passes `workspaceId`; this function
    // read only `requestedWorkspaceId`, so the value silently arrived as
    // undefined and every request fell back to the caller's OWN workspace.
    // A member switched into someone else's workspace therefore saw an empty
    // flow list — including the flow they had just created there. The owner
    // never noticed because their own workspace is the same id either way.
    const requestedWorkspaceId =
      options.requestedWorkspaceId || options.workspaceId || null;
    const sortField = ["updatedAt", "name", "createdAt"].includes(sort)
      ? sort
      : "updatedAt";
    const sortDir = sortDirection === "asc" ? "asc" : "desc";
    const take = Math.min(Number(limit) || 10, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    // resolveWorkspaceScope carries BOTH the verified workspace boundary and
    // the owner/member visibility rule (a member sees only what they created;
    // the workspace owner sees everything). Using it here rather than the raw
    // `_workspaceScope` is what keeps this list and the dashboard counts equal.
    const where = {
      deletedAt: null,
      ...(await this.resolveWorkspaceScope(
        userId,
        appContext,
        requestedWorkspaceId,
      )),
    };

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
        // bug-119: locked (over-limit) flows sort LAST, whatever the chosen
        // sort field. Owner decision 2026-08-09: after resolving an over-limit
        // lock, the flows you can no longer open must not sit above the ones you
        // chose to keep. `false` sorts before `true` in Postgres ascending, so
        // this is "unlocked first" — a stable secondary grouping, applied ahead
        // of the user's sort rather than replacing it.
        orderBy: [{ markedForDowngrade: "asc" }, { [sortField]: sortDir }],
        include: {
          project: {
            select: { id: true, name: true },
          },
          creator: {
            select: { id: true, name: true, email: true },
          },
          // Recipient faces for the card's "shared with" row. Capped at
          // SHARE_FACE_LIMIT — the UI shows "+N" from shareCount for the rest,
          // so the payload stays flat no matter how wide a flow is shared.
          // NOT filtered by appContext, deliberately: shareCount below counts
          // every context, and a face list that disagreed with the number
          // beside it reads as a bug.
          flowShares: {
            take: SHARE_FACE_LIMIT,
            orderBy: { createdAt: "asc" },
            select: {
              permission: true,
              sharedWith: {
                // BOTH avatar columns: `image` is the NextAuth/OAuth field,
                // `photo` is what the in-app avatar upload writes (a base64
                // data URI). Selecting only `image` showed initials for every
                // user who had actually set a picture — the rest of the app
                // resolves `image || photo` (Header, Sidebar, settings).
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true,
                  photo: true,
                },
              },
            },
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
      sharedWith: (f.flowShares || [])
        .filter((s) => s.sharedWith)
        .map((s) => ({
          id: s.sharedWith.id,
          name: s.sharedWith.name || s.sharedWith.email || "Member",
          email: s.sharedWith.email || null,
          image: s.sharedWith.image || s.sharedWith.photo || null,
          permission: s.permission,
        })),
      flowShares: undefined,
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
   * MASTER FLOWS — the workspace owner's view of what their MEMBERS created.
   *
   * Owner decision (2026-08-08): the exact complement of `resolveWorkspaceScope`.
   * Same workspace, same app boundary, `creatorId ≠ caller` — so this panel and
   * "My Flows" partition the workspace's flows with no overlap and no gap.
   *
   * It used to return ALL flows in the workspace (own included), which made it a
   * strict superset of the list above it — the same rows twice on one page.
   *
   * Two fixes beyond the creator filter:
   *   • `appScope(appContext)` — it had NO app boundary, so the Team app's panel
   *     listed the owner's Pro flows and vice-versa. Team matches `free` OR
   *     `team`, never `team` alone (DATA-LOSS-001).
   *   • the workspace comes from `resolveWorkspaceId`, not the bare `userId`, so
   *     the id is the same server-verified one the main list scopes by. The
   *     caller-is-owner check still lives in the controller.
   */
  async getOwnerMasterFlows(userId, requestedWorkspaceId, appContext = null) {
    const workspaceId = await resolveWorkspaceId(
      userId,
      requestedWorkspaceId || null,
    );
    const where = {
      workspaceId,
      deletedAt: null,
      ...appScope(appContext),
      // Members' flows only. `not` also excludes NULL in Prisma, which is the
      // behaviour we want: an unattributed legacy row is the owner's, not a
      // member's, and the main list treats null as "mine" for the same reason.
      creatorId: { not: userId },
    };
    const flows = await prisma.flow.findMany({
      where,
      // Same locked-last grouping as MY FLOWS (bug-119).
      orderBy: [{ markedForDowngrade: "asc" }, { updatedAt: "desc" }],
      take: 200,
      include: {
        creator: {
          // BOTH avatar columns — `image` is NextAuth/OAuth, `photo` is the
          // in-app upload (a data URI). The panel names a person, so it shows
          // their face; selecting only `image` would show initials for everyone
          // who set a picture in-app.
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            photo: true,
          },
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
      createdByEmail: f.creator?.email || null,
      createdByImage: f.creator?.image || f.creator?.photo || null,
      // Always false by construction (creatorId ≠ userId is in the where), kept
      // so the row shape matches the main list's and the UI can share renderers.
      createdBySelf: false,
      creator: undefined,
    }));
  }

  async getFlowById(
    id,
    userId,
    appContext = null,
    requestedWorkspaceId = null,
  ) {
    const scopeWhere = appContext
      ? await this._workspaceScope(userId, appContext, requestedWorkspaceId)
      : {};
    return await prisma.flow.findFirst({
      where: { id, workspaceId: userId, ...scopeWhere },
    });
  }

  async createFlow(userId, data, appContext) {
    // owner-as-workspace: the requested workspace is a USER id. Resolve it
    // (membership verified server-side, falling back to the caller's own), then
    // everything — the flow row AND the plan limit — keys off that single id.
    const workspaceId = await resolveWorkspaceId(
      userId,
      data.workspaceId || null,
    );

    // Over-limit lock: if the WORKSPACE OWNER's FlowLimit for the active
    // appContext has overLimitLocked=true, block creation until resolved via
    // upgrade or /dashboard/limitflows. Each app context is a separate record.
    // bug-U4: this keyed on `userId` (the caller) — a member creating inside an
    // over-limit workspace has no FlowLimit row of their own, so the lock was
    // missed. The limit belongs to the owner (`workspaceId`), exactly like the
    // ceiling check below and getLockState/_assertFlowUnlocked.
    if (appContext === "pro" || appContext === "team") {
      const dbAppType = appContext === "pro" ? "individual" : "enterprise";
      const limitRecord = await prisma.flowLimit.findFirst({
        where: { userId: workspaceId, appType: dbAppType },
        select: { overLimitLocked: true },
      });
      if (limitRecord?.overLimitLocked) {
        throw new AppError(
          "Your flows are locked because you exceeded your plan limit. Upgrade or limit your flows to continue.",
          403,
          "FLOW_LOCKED",
        );
      }
    }

    // The limit belongs to the WORKSPACE OWNER — creating inside someone
    // else's workspace spends their allowance, exactly as a team member used
    // to spend the team owner's. The workspace id IS that owner's user id.
    const owner = await prisma.user.findUnique({
      where: { id: workspaceId },
      select: {
        proUnlimitedFlows: true,
        proFlowLimit: true,
        proAdditionalFlowsPurchased: true,
        teamFlowLimit: true,
        teamUnlimitedFlows: true,
        flowAddonStatus: true,
        flowAddonPlan: true,
        flowAddonCurrentPeriodEnd: true,
      },
    });
    if (owner) {
      const addonActive =
        owner.flowAddonStatus === "active" &&
        (!owner.flowAddonCurrentPeriodEnd ||
          new Date(owner.flowAddonCurrentPeriodEnd) > new Date());
      const isAddonUnlimited =
        addonActive && owner.flowAddonPlan === "unlimited";
      let effectiveLimit = null;
      if (appContext === "team") {
        if (!owner.teamUnlimitedFlows) {
          effectiveLimit = owner.teamFlowLimit || 50;
        }
      } else if (!owner.proUnlimitedFlows && !isAddonUnlimited) {
        effectiveLimit =
          addonActive && owner.flowAddonPlan === "standard_100"
            ? 100
            : (owner.proFlowLimit || 10) +
              (owner.proAdditionalFlowsPurchased || 0);
      }
      if (effectiveLimit !== null) {
        const count = await prisma.flow.count({
          where: { workspaceId, deletedAt: null, ...appScope(appContext) },
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

    return await prisma.flow.create({
      data: {
        name: data.name,
        description: data.description,
        thumbnail: data.thumbnail,
        diagramData: data.xml || data.diagramData || "",
        isPublic: data.isPublic || false,
        workspaceId,
        creatorId: userId,
        projectId: data.projectId || null,
        // The app the caller is in — now the ONLY thing separating the Pro app
        // from the Team app (see lib/workspaceScope.appScope).
        appContext,
      },
    });
  }

  async updateFlow(id, userId, data, createVersion = false) {
    // FEAT-002: version snapshots are now manual-save-only. The flag can be
    // passed explicitly OR ride along in the request body (controller forwards
    // req.body verbatim as `data`), so both call paths are supported.
    if (data && data.createVersion) createVersion = true;
    const flow = await prisma.flow.findFirst({
      where: { id, workspaceId: userId, deletedAt: null },
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
        const entitlements = await getEntitlements(flow.workspaceId);
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
      // NOTE: updateFlow is currently owner-scoped (`workspaceId: userId` above),
      // so `flow.workspaceId === userId` always holds and this branch is dormant —
      // it fires the instant a collaborator-edit path is enabled (i.e. when
      // the update is allowed to resolve a team-mate's flow). It is guarded so
      // it can never notify the editor about their own edit. Do NOT relax the
      // workspaceId binding to activate this without isolation sign-off
      // (DATA-LOSS-001).
      await this._notifyOwnerOfCollaboratorEdit(flow, userId).catch(() => {});
    }

    return updated;
  }

  async _notifyOwnerOfCollaboratorEdit(flow, editorId) {
    if (!flow?.workspaceId || flow.workspaceId === editorId) return; // own edit — skip

    // Throttle: skip if we already logged an edit for this flow within window.
    const since = new Date(Date.now() - FLOW_EDIT_NOTIFY_THROTTLE_MS);
    const recent = await prisma.notification.findFirst({
      where: {
        userId: flow.workspaceId,
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
      flow.workspaceId,
      "flow_updated",
      "Flow updated",
      `${editor?.name || editor?.email || "A collaborator"} edited "${
        flow.name || "your flow"
      }".`,
      `/dashboard/flows/${flow.id}`,
      { flowId: flow.id, flowName: flow.name || null, editedBy: editorId },
      flow.appContext || "team", // appContext
      flow.requestedWorkspaceId || null, // scope to the flow's workspace
    );
  }

  async deleteFlow(id, userId) {
    const flow = await prisma.flow.findFirst({
      where: { id, deletedAt: null },
    });
    if (!flow) throw new AppError("Flow not found", 404, "NOT_FOUND");

    // Owner can always delete
    if (flow.workspaceId === userId) {
      return await prisma.flow.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    }

    // §5 multi-tenant: creator (member) can delete their OWN flow. Same
    // load-bearing creator check as getFlowWithAccess/updateFlowWithAccess —
    // without it every member could delete every flow in the workspace,
    // including ones merely shared with them read-only. Deletion is never
    // granted by a share at all, so there is no share fallback here.
    if (
      flow.creatorId === userId &&
      (await canEnterWorkspace(userId, flow.workspaceId))
    ) {
      return await prisma.flow.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    }

    throw new AppError("Flow not found", 404, "NOT_FOUND");
  }

  async getTrash(
    userId,
    options = {},
    appContext = "team",
    requestedWorkspaceId = null,
  ) {
    const { page = 1, limit = 20 } = options;
    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    // Trash is the flows list, filtered to deleted rows — so it must use the
    // SAME scope. It called `workspaceScope` without `appContext`, so
    // `appScope(null)` returned {} and the trash had NO app boundary and no
    // member narrowing: a Pro-app trash view listed Team-app flows, including
    // ones deleted by other members of the workspace.
    const where = await this._trashScope(
      userId,
      appContext,
      requestedWorkspaceId,
    );

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

  /**
   * The ONE scope for everything that touches a trashed row — list, restore,
   * permanent-delete, empty. Identical to the flows list plus `deletedAt`, so
   * "what you can see in the trash" and "what you can act on in the trash" are
   * the same set by construction.
   *
   * bug-113 was the wipe diverging from the list. bug-114 is the same fault in
   * the other direction: restore and permanent-delete scoped by
   * `{ id, workspaceId: userId }`, and after owner-as-workspace `workspaceId`
   * is the OWNER's user id — so for a MEMBER it never matched. A member saw
   * their deleted flow in their own trash, clicked Restore, and got
   * `404 Flow not found in trash`, every time, until the 30-day purge took it.
   */
  async _trashScope(userId, appContext, requestedWorkspaceId) {
    return {
      ...(await this.resolveWorkspaceScope(
        userId,
        appContext,
        requestedWorkspaceId,
      )),
      deletedAt: { not: null },
    };
  }

  async restoreFlow(
    id,
    userId,
    appContext = "team",
    requestedWorkspaceId = null,
  ) {
    const result = await prisma.flow.updateMany({
      where: {
        id,
        ...(await this._trashScope(userId, appContext, requestedWorkspaceId)),
      },
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
      where: { id: flowId, workspaceId: userId, deletedAt: null },
    });
    if (!flow)
      throw new AppError("Access denied or flow not found", 403, "FORBIDDEN");

    // bug-B3: restoring a version overwrote diagramData with no lock check, so
    // an over-limit owner could rewrite a locked flow the editor refuses to
    // open or save. Same guard as the open/save paths.
    await this._assertFlowUnlocked(flow, userId);

    // 2. Load the target version.
    const version = await prisma.flowVersion.findFirst({
      where: { id: versionId, flowId },
    });
    if (!version) throw new AppError("Version not found", 404, "NOT_FOUND");

    // Resolve the owner's tier version cap up front (read-only).
    const entitlements = await getEntitlements(flow.workspaceId);
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

  async permanentDeleteFlow(
    id,
    userId,
    appContext = "team",
    requestedWorkspaceId = null,
  ) {
    const result = await prisma.flow.deleteMany({
      where: {
        id,
        ...(await this._trashScope(userId, appContext, requestedWorkspaceId)),
      },
    });
    if (result.count === 0)
      throw new AppError("Flow not found in trash", 404, "NOT_FOUND");
    return result;
  }

  async emptyTrash(userId, appContext = "team", requestedWorkspaceId = null) {
    // MUST use the SAME scope as getTrash — this is a HARD delete, so anything
    // the scopes disagree about is destroyed without ever having been shown.
    //
    // It was `{ workspaceId: userId, deletedAt: { not: null } }`: no app
    // boundary and no creator narrowing, while getTrash has both. After the
    // owner-as-workspace rename `workspaceId` is the OWNER's user id, so for a
    // workspace owner that where-clause matched every deleted flow in the
    // workspace — their own Pro-app trash while they stood in the Team app, and
    // every member's trashed flows, none of which the page had listed. The
    // owner saw "1 item", clicked Empty Trash, and `deleteMany` permanently
    // removed four rows with no soft-delete to fall back on. The member's flow
    // simply vanished from their own trash, inside the 30 days the page
    // promises. (The controller already passed appContext; the old signature
    // silently dropped it.)
    const where = await this._trashScope(
      userId,
      appContext,
      requestedWorkspaceId,
    );
    return await prisma.flow.deleteMany({ where });
  }

  async purgeOldTrash(daysOld = 30) {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    return await prisma.flow.deleteMany({
      where: { deletedAt: { not: null, lt: cutoff } },
    });
  }

  async getFavorites(userId, appContext = "team", requestedWorkspaceId = null) {
    // Workspace-scoped (DATA-LOSS-001): favorites must follow the active
    // context like every other personal-data list — previously this returned
    // ALL of the user's favorites across personal + every team workspace.
    //
    // `resolveWorkspaceScope`, not the raw `_workspaceScope`: favorites is a
    // FILTER over "my flows", and the flows list applies `?isFavorite=true`
    // through the creator-scoped fragment. With the bare workspace scope the two
    // disagreed — a member favouriting their own flow put it in the OWNER's
    // favorites, where opening it was fine but it appeared nowhere in the list
    // it claimed to be a subset of.
    return await prisma.flow.findMany({
      where: {
        // bug-M11: `resolveWorkspaceScope` OWNS the workspaceId (+ appScope) —
        // the literal `workspaceId: userId` that used to sit here was dead
        // (overwritten by the spread) and, if the two were ever reordered,
        // would silently pin favourites to the caller instead of the resolved
        // workspace, diverging from the ?isFavorite=true flows list.
        isFavorite: true,
        deletedAt: null,
        ...(await this.resolveWorkspaceScope(
          userId,
          appContext,
          requestedWorkspaceId,
        )),
      },
      // Favourites is a filter over MY FLOWS, so it carries the same
      // locked-last grouping (bug-119).
      orderBy: [{ markedForDowngrade: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        thumbnail: true,
        updatedAt: true,
        markedForDowngrade: true,
      },
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
    // member who created it under a tenant namespace (workspaceId = tenant owner,
    // creatorId = this member).
    const flow = await prisma.flow.findFirst({
      where: {
        id: flowId,
        deletedAt: null,
        OR: [{ workspaceId: userId }, { creatorId: userId }],
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
      // CHANGE-001: "my people" = everyone sharing a WORKSPACE with me — the
      // other members plus each workspace's owner. Teams no longer scope this.
      const myRows = await prisma.teamMember.findMany({
        where: { userId },
        select: { workspaceId: true },
      });
      const wsIds = [...new Set([userId, ...myRows.map((r) => r.workspaceId)])];
      const validMembers = await prisma.teamMember.findMany({
        where: { workspaceId: { in: wsIds }, userId: { not: userId } },
        select: { userId: true },
      });
      validTeamIds = new Set([
        ...validMembers.map((m) => m.userId),
        ...wsIds.filter((w) => w !== userId), // the workspace owners
      ]);
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
      flow.workspaceId === userId || flow.creatorId === userId;
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
    // Match shareFlow's ownership check: the tenant owner OR the member who
    // created the flow under the tenant namespace (workspaceId = tenant owner,
    // creatorId = this member) may manage its shares. Checking workspaceId alone
    // meant a member could create a share but not edit it (Issue #6).
    const flow = await prisma.flow.findFirst({
      where: {
        id: flowId,
        deletedAt: null,
        OR: [{ workspaceId: userId }, { creatorId: userId }],
      },
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
    // The tenant owner, the member who CREATED the flow, or the share's own
    // recipient may remove it. Previously creatorId was ignored, so a member
    // couldn't remove a share on a flow they created themselves (Issue #6).
    if (
      flow.workspaceId !== userId &&
      flow.creatorId !== userId &&
      share.sharedWithId !== userId
    ) {
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

    // CHANGE-001: everyone sharing a WORKSPACE with this user, deduplicated.
    const myRows = await prisma.teamMember.findMany({
      where: { userId },
      select: { workspaceId: true },
    });
    const requestedWorkspaceIds = [
      ...new Set([userId, ...myRows.map((r) => r.workspaceId)]),
    ];

    const seen = new Set();
    const unique = [];

    if (requestedWorkspaceIds.length > 0) {
      const members = await prisma.teamMember.findMany({
        where: {
          workspaceId: { in: requestedWorkspaceIds },
          userId: { not: userId },
        },
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
    // Resolve the set of PEERS whose shares to this user are visible in the
    // current scope. A peer is anyone in a team the user is part of — as the
    // team OWNER or as a MEMBER. Bug fix (Fix_issues.md Issue #4): the old
    // logic only allowed the team OWNER as the sharer, so it never surfaced:
    //   • owner ← member share  (an owner is not a teamMember row of their own
    //                            team, so the personal branch returned [])
    //   • member ← member share (peer-to-peer within one team)
    // Both are now covered. Isolation is still enforced by (a) sharedWithId ===
    // this user (only shares explicitly targeted at them), and (b) the
    // appContext double-anchor below — never by sharedById alone.
    // CHANGE-001: peers are resolved from the WORKSPACE, not from teams. A
    // workspace is its owner, so its people are that owner plus everyone
    // holding a membership row for it — regardless of which teams (if any)
    // they are labelled with. That is what keeps a share visible after the
    // team the two people shared through has been deleted.
    const peerIdsForWorkspace = async (workspaceId) => {
      if (!workspaceId) return [];
      const members = await prisma.teamMember.findMany({
        where: { workspaceId },
        select: { userId: true },
      });
      const set = new Set([
        workspaceId, // the workspace owner
        ...(Array.isArray(members) ? members : []).map((m) => m.userId),
      ]);
      set.delete(userId); // you never "share with yourself"
      return [...set];
    };

    let peerIds;
    if (activeTeamId) {
      // Workspace context: the header carries the owner's user id. Verify the
      // caller may actually enter it before treating its people as peers.
      if (!(await canEnterWorkspace(userId, activeTeamId))) return [];
      peerIds = await peerIdsForWorkspace(activeTeamId);
    } else {
      // Personal context: the caller's OWN workspace. Shares from workspaces
      // they merely belong to stay hidden until they switch into them
      // (B50 — workspace isolation for "Shared with me").
      peerIds = await peerIdsForWorkspace(userId);
    }
    if (!peerIds.length) return [];
    const sharedByFilter = { sharedById: { in: peerIds } };

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

  // Truly public, unauthenticated read — no userId at all. Only flows the
  // owner explicitly flagged isPublic=true (via flowsApi.publish) are
  // reachable here; everything else 404s. Always view-only — callers must
  // never let this path touch updateFlow/deleteFlow.
  async getPublicFlow(id) {
    const flow = await prisma.flow.findFirst({
      where: { id, isPublic: true, deletedAt: null },
    });
    if (!flow) return null;
    return { ...flow, permission: "view" };
  }

  /**
   * The ONE place a locked flow is refused. Two independent locks:
   *
   *  1. `flowLimit.overLimitLocked` — the WORKSPACE is over its plan and the
   *     owner has not resolved the picker yet. Keyed on `flow.workspaceId`, so
   *     it blocks the owner, members and share recipients alike.
   *  2. `flow.markedForDowngrade` — THIS flow was not among the ones the owner
   *     chose to keep.
   *
   * bug-121: (2) was enforced NOWHERE on the server. Every read and write path
   * ignored it, so the padlock existed only in the client — the card was greyed
   * out and the click blocked, but pasting the flow's URL opened it and saving
   * worked. A plan limit that a bookmark bypasses is not a limit: a user over
   * their cap could keep using all of their flows indefinitely and had no
   * reason to upgrade.
   *
   * Applied to opening (`getFlowByIdWithAccess`) AND saving
   * (`updateFlowWithAccess`) — blocking only the read would leave a direct PUT
   * wide open, which is the same hole one layer down.
   *
   * Super-admin bypasses both, for support.
   */
  async _assertFlowUnlocked(flow, userId) {
    const requester = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (requester?.role === "super_admin") return;

    if (flow.markedForDowngrade) {
      throw this._flowLockedError(flow);
    }

    // bug-126: the lock that governs THIS flow is the lock of the app the flow
    // belongs to — `flow.appContext` — NOT the caller's `X-App-Context`.
    //
    // It was `appContext || flow.appContext`. A bare editor tab (a pasted URL)
    // establishes no app context, so axios defaults `X-App-Context: team`
    // (bug-124's root cause). A PRO flow opened in such a tab was then checked
    // against the caller's *team* limit record — unlocked / nonexistent — so the
    // workspace-wide pro lock was missed and the flow opened with no modal,
    // while `/dashboard/flows` (reached via the switcher, which sets pro
    // context) correctly showed it locked. The flow's own app_context is the
    // only authoritative answer here; the caller's header must not be able to
    // pick which lock applies to a fixed flow.
    const lockAppType = flow.appContext;
    if (lockAppType !== "pro" && lockAppType !== "team") return;
    const limitRecord = await prisma.flowLimit.findFirst({
      where: {
        userId: flow.workspaceId,
        appType: lockAppType === "pro" ? "individual" : "enterprise",
      },
      select: { overLimitLocked: true },
    });
    if (limitRecord?.overLimitLocked) {
      throw this._flowLockedError(flow);
    }
  }

  /**
   * bug-124: the FLOW_LOCKED error carries the flow's `appContext` and
   * `workspaceId` in `details`. The editor is opened in a bare tab
   * (`/dashboard/flows/:id`), where nothing establishes the per-tab app
   * context — `appFromPathname` only matches `/dashboard/pro|team`, so the tab
   * defaults to "team", which then makes `getAiBillingTeamId()` read the wrong
   * (team) billing key too. When the locked modal redirected to the flows list,
   * that wrong context came with it (owner-reported leak). The client now reads
   * these back off the 403 and pins the correct context BEFORE navigating.
   * errorHandler already forwards `err.details`.
   */
  _flowLockedError(flow) {
    const err = new AppError(
      "This flow is locked because the workspace is over its plan limit. " +
        "Upgrade, or choose it in Limit Flows, to use it again.",
      403,
      "FLOW_LOCKED",
    );
    err.details = {
      appContext: flow.appContext,
      workspaceId: flow.workspaceId,
    };
    return err;
  }

  async getFlowByIdWithAccess(
    id,
    userId,
    appContext = null,
    requestedWorkspaceId = null,
  ) {
    const flow = await prisma.flow.findFirst({
      where: { id, deletedAt: null },
    });
    if (!flow) return null;

    await this._assertFlowUnlocked(flow, userId);

    // Owner path — enforce appContext workspace scope when context is known.
    // A Pro flow cannot be opened from a Team context and vice-versa.
    if (flow.workspaceId === userId) {
      if (appContext) {
        const scopeWhere = await this._workspaceScope(
          userId,
          appContext,
          requestedWorkspaceId,
        );
        const inScope = await prisma.flow.findFirst({
          where: { id, workspaceId: userId, ...scopeWhere },
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
    // owner's namespace (workspaceId=tenantOwner, creatorId=caller), so they
    // own it despite the workspace naming someone else.
    //
    // SECURITY — the creator check is load-bearing. This branch briefly read
    // "anyone who can enter the workspace acts inside it", which handed
    // owner-level access on EVERY flow in the workspace to every member: a
    // view-only share was upgraded to owner before the share check below could
    // run, and flows never shared at all became readable by id. It also
    // contradicted resolveWorkspaceScope, which pins members to
    // `creatorId = userId` so a member's LIST shows only their own flows —
    // by-id access has to draw the same line or the scoping means nothing.
    if (
      flow.creatorId === userId &&
      (await canEnterWorkspace(userId, flow.workspaceId))
    ) {
      return { ...flow, permission: "owner" };
    }

    // Shared path — shares are tagged with the appContext they were created in,
    // and a cross-context share is blocked (a pro share ≠ team context).
    //
    // This used to also allow `{ appContext: null }` for "legacy records
    // predating the field". `FlowShare.appContext` is a NON-nullable enum with
    // a default (schema.prisma), so no such record can exist and Prisma
    // rejects the filter outright — "Argument `appContext` is missing" — a 500
    // on every share-based open. It went unnoticed because the membership
    // branch above returned before this line was ever reached; removing that
    // over-broad branch exposed it immediately.
    const shareWhere = {
      flowId: id,
      sharedWithId: userId,
      ...(appContext ? { appContext } : {}),
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
    // workspaceId directly.
    const requester = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (requester?.role === "super_admin") {
      return { ...flow, permission: "admin_view" };
    }

    return null;
  }

  async updateFlowWithAccess(id, userId, data, appContext = null) {
    const flow = await prisma.flow.findFirst({
      where: { id, deletedAt: null },
    });
    if (!flow) throw new AppError("Flow not found", 404, "NOT_FOUND");

    // Same guard as the read path (bug-121). Without it a locked flow could not
    // be opened but could still be written to by a direct PUT — the editor's
    // autosave would happily keep saving into it.
    await this._assertFlowUnlocked(flow, userId);

    // Owner can always edit
    if (flow.workspaceId === userId) {
      return await this.updateFlow(id, userId, data);
    }

    // §5 multi-tenant: creator (member) can edit their OWN flow. The creatorId
    // check is what makes that "their own" — without it any member of the
    // workspace could write to any flow in it, which silently overrode a
    // view-only FlowShare because this branch runs before the share check
    // below. Mirrors the same guard in getFlowWithAccess.
    if (
      flow.creatorId === userId &&
      (await canEnterWorkspace(userId, flow.workspaceId))
    ) {
      return await this.updateFlow(id, flow.workspaceId, data);
    }

    // Check shared edit permission.
    //
    // The appContext filter mirrors getFlowWithAccess: a share is tagged with
    // the app it was created in, and a share made in one app must not be
    // usable from another. Without it the WRITE path was laxer than the READ
    // path — a flow you could not even open in this context could still be
    // saved over by id.
    const share = await prisma.flowShare.findFirst({
      where: {
        flowId: id,
        sharedWithId: userId,
        permission: "edit",
        ...(appContext ? { appContext } : {}),
      },
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
        const entitlements = await getEntitlements(flow.workspaceId);
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
      // owner-only primitive) keeps its workspaceId binding untouched per
      // DATA-LOSS-001; the collaborator-edit side-effects belong here, where
      // access has already been verified (owner OR FlowShare edit).
      //
      // Both helpers self-guard against owner==editor, so the owner editing
      // their own flow produces neither a notification nor an audit row.
      // createNotification() emits over Socket.IO to room user:<workspaceId>
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
    if (!flow?.workspaceId || flow.workspaceId === editorId) return;

    const [editor, owner, versionCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: editorId },
        select: { name: true, email: true },
      }),
      prisma.user.findUnique({
        where: { id: flow.workspaceId },
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
          workspaceId: flow.workspaceId,
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
        workspaceId: userId,
        version: flowData.version,
        appContext,
      },
    });
  }

  // ==================== END SHARING ====================

  async updateDiagramState(id, userId, groupId, newShape) {
    const flow = await this.getFlowById(id, userId);
    if (!flow) throw new AppError("Flow not found", 404, "NOT_FOUND");

    // bug-B2: this write path bypassed the plan lock. An over-limit owner (or
    // any client) could keep dropping shapes into a marked-for-downgrade /
    // over-limit flow via PUT /:id/diagram even though open/save refuse it.
    // Same guard the read/save paths use (getFlowByIdWithAccess / updateFlowWithAccess).
    await this._assertFlowUnlocked(flow, userId);

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
  // recently updated. Only PERSONAL flows (requestedWorkspaceId null) are at risk.
  // teamPicker=true scopes to team flows (the team-subscription-expired
  // picker) instead of personal Pro flows.
  async getPickerList(userId, teamPicker = false, requestedWorkspaceId = null) {
    // The picker MUST show the same set `getPackStatus` counts — that count is
    // what told the user "you have 12 flows, keep 10". So: the resolved
    // workspace + `appScope`, and NOT creator-scoped (a member's flow consumes
    // the owner's quota, so it has to be pickable).
    //
    // It was `workspaceId: userId`, hardcoded, ignoring the header — the same
    // owner-as-workspace survivor as bug-104's master-view: a member acting
    // inside someone else's workspace queried for their OWN id, matched
    // nothing, and got an empty picker with no way to get under the limit.
    // The `appContext: "team"` exact-equality on the teamPicker branch also
    // dropped free-era flows, which the counter includes (free-fold).
    const workspaceId = await resolveWorkspaceId(userId, requestedWorkspaceId);
    const flows = await prisma.flow.findMany({
      where: {
        workspaceId,
        ...appScope(teamPicker ? "team" : null),
        // Include both active and currently-marked-for-downgrade flows so
        // the user can see what's at risk and pick from everything.
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

  // Confirm the user's flow selection. Trashes everything else.
  // teamPicker=true → team-subscription picker: keep up to 50 team flows.
  async confirmSelection(
    userId,
    selectedIds,
    teamPicker = false,
    requestedWorkspaceId = null,
  ) {
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

    // Same scope as getPickerList — this TRASHES everything not selected, so a
    // divergence here would destroy rows the picker never offered (the fault
    // bug-113 fixed on the trash side).
    const workspaceId = await resolveWorkspaceId(userId, requestedWorkspaceId);
    const pickerScope = {
      workspaceId,
      ...appScope(teamPicker ? "team" : null),
    };

    // Verify every selected ID is in that same scope.
    const owned = await prisma.flow.findMany({
      where: { id: { in: selectedIds }, ...pickerScope },
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
      where: pickerScope,
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
  async getPackStatus(
    userId,
    requestedWorkspaceId = null,
    appContext = "team",
  ) {
    // §5: a member inside someone else's workspace inherits that owner's flow
    // limits (same rule as getEntitlements).
    //
    // This function was missed by the 2026-08-07 owner-as-workspace refactor and
    // still treated the incoming id as a TEAM id — it looked it up in `teams`,
    // found nothing (the header now carries a USER id), and silently fell back
    // to the caller's own limits. `resolveWorkspaceId` is the canonical helper:
    // it verifies membership server-side and falls back to the caller's own
    // workspace, so a forged header grants nothing (DATA-LOSS-001).
    // Under owner-as-workspace the workspace id IS the owning user's id, so
    // this one value answers both "whose limits?" and "whose flows?".
    const workspaceId = await resolveWorkspaceId(userId, requestedWorkspaceId);

    const user = await prisma.user.findUnique({
      where: { id: workspaceId },
      select: {
        proFlowLimit: true,
        proAdditionalFlowsPurchased: true,
        proUnlimitedFlows: true,
        flowAddonStatus: true,
        flowAddonPlan: true,
        flowAddonCurrentPeriodEnd: true,
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

    // Count only flows that belong to the ACTIVE context: this workspace, in
    // the app the caller is looking at. That is the same shape getAppStatus
    // uses, so the banner's numerator can't drift from the Pro page's count.
    //
    // The count is workspace-wide, not per-member, because the limit it is
    // measured against is the workspace owner's shared allowance.
    //
    // Two rename casualties lived here and produced a hard 500 for every member
    // inside another workspace (`GET /flows/pack-status` → Prisma
    // "Unknown argument `requestedWorkspaceId`"):
    //   • `flowScope = { requestedWorkspaceId }` — the old key was `teamId`, a
    //     real Flow column; the renamed variable never was one.
    //   • the else-branch looked up `ownTeam` and then discarded it
    //     (`flowScope = {}`), so the app filter bug-039 added was silently lost
    //     and the Team banner counted Pro flows again.
    // `appScope` restores that filter the DATA-LOSS-001-safe way: the Team app
    // matches free OR team, never `team` alone.
    const flowCount = await prisma.flow.count({
      where: {
        workspaceId,
        deletedAt: null,
        ...appScope(appContext),
      },
    });

    const addonActive =
      user.flowAddonStatus === "active" &&
      (!user.flowAddonCurrentPeriodEnd ||
        new Date(user.flowAddonCurrentPeriodEnd) > new Date());
    const isAddonUnlimited = addonActive && user.flowAddonPlan === "unlimited";
    const limit =
      user.proUnlimitedFlows || isAddonUnlimited
        ? -1
        : addonActive && user.flowAddonPlan === "standard_100"
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
      // bug-037: must match the same OR-logic used for `limit` below —
      // proUnlimitedFlows alone missed users whose unlimited status comes
      // from an active flow-addon subscription rather than the flag itself.
      isUnlimited: !!user.proUnlimitedFlows || isAddonUnlimited,
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
