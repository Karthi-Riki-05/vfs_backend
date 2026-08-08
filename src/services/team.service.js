const { prisma } = require("../lib/prisma");
const { resolveWorkspaceId } = require("../lib/workspaceScope");
const AppError = require("../utils/AppError");
const crypto = require("crypto");
const { sendTeamInviteEmail, sendEmail } = require("../utils/email");
const notificationService = require("./notification.service");
const logger = require("../utils/logger");
// bug-093: a team's chat room is part of the team, so its lifecycle lives
// alongside the team's — created with it, and its roster tracks membership.
const {
  createTeamRoom,
  addUserToTeamRoom,
  removeUserFromTeamRoom,
  removeUserFromAllWorkspaceRooms,
  closeTeamRoom,
} = require("../lib/teamChatRoom");
// CHANGE-001: membership is one row per (person, workspace) with a `teamIds`
// array, so there is no Team.members relation to filter or include any more.
const {
  visibleTeamsWhere,
  memberTeamIds,
  teamMemberRows,
  teamMemberCount,
  addTeamToMember,
  removeTeamFromMembers,
  removeMemberFromTeam,
  removeFromWorkspace,
} = require("../lib/teamMembership");

class TeamService {
  async getTeams(
    userId,
    options = {},
    appContext = "team",
    activeTeamId = null,
  ) {
    const { page = 1, limit = 20 } = options;
    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const where = { deletedAt: null };

    if (activeTeamId) {
      // Workspace context: show the teams of the workspace the caller has
      // switched into, limited to ones they actually belong to.
      //
      // `activeTeamId` is a WORKSPACE id — the owner's USER id — not a team id.
      // This still looked it up with `team.findFirst({ id: activeTeamId })`,
      // which could never match, so every switched-in member fell through to
      // "my own teams" and saw an EMPTY Teams page inside a workspace they
      // belong to. resolveWorkspaceId verifies the claim server-side.
      const wsId = await resolveWorkspaceId(userId, activeTeamId);
      if (wsId !== userId) {
        // Member context: that owner's teams, intersected with the caller's.
        where.teamOwnerId = wsId;
        where.id = { in: await memberTeamIds(userId) };
      } else {
        // Owner switched to their own context — show their own teams.
        where.teamOwnerId = userId;
      }
    } else {
      // Personal workspace (no X-Workspace-Context): only show teams this user owns.
      // Teams the user was invited into belong to another owner's workspace and
      // must not bleed into the user's personal context.
      where.teamOwnerId = userId;
    }

    // App-isolation: Pro workspace shows only Pro-context teams; Team workspace
    // shows only non-Pro teams.
    if (appContext === "pro") {
      where.appContext = "pro";
    } else {
      where.appContext = { not: "pro" };
    }
    // Hide system/workspace teams auto-created during subscription.
    where.AND = [
      { OR: [{ verifyTeam: null }, { verifyTeam: { not: "system" } }] },
    ];

    const [rawTeams, total] = await Promise.all([
      prisma.team.findMany({
        where,
        skip,
        take,
        include: {
          owner: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.team.count({ where }),
    ]);

    // CHANGE-001: `members`/`_count.members` were relation includes; membership
    // now lives in a scalar array, so the roster is fetched per team and
    // re-attached in the same shape the API already returned.
    const teams = await this._attachMembers(rawTeams, { take: 5 });

    return {
      teams,
      total,
      page: Number(page) || 1,
      totalPages: Math.ceil(total / take),
    };
  }

  /**
   * Re-attach `members` + `_count.members` to team rows, preserving the response
   * shape the frontend already consumes. One query for the whole page rather
   * than one per team.
   */
  async _attachMembers(teams, { take = null } = {}) {
    const list = Array.isArray(teams) ? teams : [teams];
    const ids = list.map((t) => t.id).filter(Boolean);
    if (!ids.length) return teams;

    const rows = await prisma.teamMember.findMany({
      where: { teamIds: { hasSome: ids } },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const byTeam = new Map(ids.map((id) => [id, []]));
    for (const r of rows) {
      for (const tid of r.teamIds || []) {
        if (byTeam.has(tid)) byTeam.get(tid).push(r);
      }
    }

    const out = list.map((t) => {
      const all = byTeam.get(t.id) || [];
      return {
        ...t,
        members: take ? all.slice(0, take) : all,
        _count: { ...(t._count || {}), members: all.length },
      };
    });
    return Array.isArray(teams) ? out : out[0];
  }

  async getTeamById(teamId, userId, appContext = "team") {
    const where = {
      id: teamId,
      ...(await visibleTeamsWhere(userId)),
    };
    // App-isolation: in Pro app, only Pro-context teams are visible.
    if (appContext === "pro") {
      where.appContext = "pro";
    }
    const found = await prisma.team.findFirst({
      where,
      include: {
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    if (!found) throw new AppError("Team not found", 404, "NOT_FOUND");
    const team = await this._attachMembers(found);
    return team;
  }

  /**
   * Create a team inside a workspace.
   *
   * bug-112 (owner decision, 2026-08-09): ADMINs may create teams, not just the
   * workspace owner. The team is owned by the WORKSPACE OWNER, never by the
   * admin who created it — that is what keeps bug-085's protection intact. A
   * caller-owned team inside someone else's tenant would escape that owner's
   * hierarchy and inherit the CREATOR's (often free) tier, which is the hole
   * bug-085 closed. Owned by the workspace, it inherits the right plan and the
   * owner keeps control of their own tenant.
   *
   * Authorization lives in `requireTeamCreateEntitlement` (OWNER/ADMIN only);
   * this method is given the already-resolved workspace.
   */
  async createTeam(userId, data = {}, appContext = "team", workspaceId = null) {
    const ws = await resolveWorkspaceId(userId, workspaceId || null);
    const teamOwnerId = ws;
    const creatorIsOwner = ws === userId;
    return await prisma.$transaction(async (tx) => {
      const team = await tx.team.create({
        data: {
          name: data.name || null,
          description: data.description || null,
          teamOwnerId,
          appType: data.appType || null,
          appContext,
          status: "active",
          countMem: 1,
        },
        include: { owner: { select: { id: true, name: true, email: true } } },
      });

      // Add the workspace OWNER as the team's owner-member. Their workspace IS
      // their user id, and if they already have a membership row there this
      // appends the new team id rather than creating a second row.
      await addTeamToMember(tx, {
        userId: teamOwnerId,
        workspaceId: teamOwnerId,
        teamId: team.id,
        role: "OWNER",
        // The seat belongs to the app the team was created in.
        appContext: team.appContext || "team",
      });

      // An ADMIN who created it joins their own team too — otherwise they could
      // create a team they cannot then see or manage, since the per-team gates
      // require `teamIds: { has: teamId }`. Their workspace role (ADMIN) is
      // preserved; addTeamToMember only ever escalates MEMBER.
      if (!creatorIsOwner) {
        await addTeamToMember(tx, {
          userId,
          workspaceId: ws,
          teamId: team.id,
          role: "ADMIN",
          appContext: team.appContext || "team",
        });
      }

      // bug-093: create the team's chat room HERE rather than leaving it to
      // whoever clicks the team first in the Chat tab. That lazy path goes
      // through the owner/admin-only group-create gate, so a plain member
      // clicking first got a 403 and could never open team chat at all.
      // Same transaction: a team must not exist without its room.
      await createTeamRoom(tx, {
        team,
        creatorId: userId,
        appContext,
      });

      return team;
    });
  }

  async updateTeam(teamId, userId, data, appContext = "team") {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new AppError("Team not found", 404, "NOT_FOUND");

    // bug-112: the team owner OR an ADMIN of that workspace may edit it. This
    // used to be a single `findFirst({ teamOwnerId: userId })`, which reported
    // "not found" for an admin — indistinguishable from a missing team.
    if (team.teamOwnerId !== userId) {
      const admin = await prisma.teamMember.findFirst({
        where: {
          userId,
          workspaceId: team.teamOwnerId,
          role: { in: ["OWNER", "ADMIN"] },
          // Per-app seats: an admin of the Team app is not an admin of the Pro
          // app, even in the same workspace.
          appContext: appContext === "pro" ? "pro" : "team",
        },
        select: { id: true },
      });
      if (!admin) {
        throw new AppError(
          "Only the team owner or a workspace admin can edit this team",
          403,
          "FORBIDDEN",
        );
      }
    }

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.teamMem !== undefined) updateData.teamMem = data.teamMem;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.appType !== undefined) updateData.appType = data.appType;

    return await prisma.team.update({
      where: { id: teamId },
      data: updateData,
    });
  }

  async deleteTeam(teamId, userId) {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new AppError("Team not found", 404, "NOT_FOUND");
    if (team.teamOwnerId !== userId)
      throw new AppError(
        "Only the team owner can delete this team",
        403,
        "FORBIDDEN",
      );

    // Deleting a team revokes ACCESS; it does not destroy content.
    //
    // bug-094 history: chat/flows/shapes used to be keyed on the team, and the
    // FK was `onDelete: SetNull` — so deleting a team blanked `workspace_id`,
    // which this codebase read as PERSONAL. A team's conversation and diagrams
    // were therefore re-homed into ex-members' personal space, history intact.
    // That failure mode is gone: `workspace_id` now holds the OWNER's user id
    // and the FK points at `users`, so a team delete cannot touch it.
    //
    // What must still happen is eviction from the workspace room — and only for
    // members with no OTHER team in this workspace, since the room is shared
    // across all of the owner's teams.
    // CHANGE-001 — deleting a team deletes the GROUPING, never the people.
    //
    // Owner decision (2026-08-07): the team is a label. When it goes, every
    // member STAYS in the workspace and keeps using its features; only the label
    // is removed from their `teamIds`. Their membership row survives, so
    // `canEnterWorkspace` still returns true and they keep their seat in the
    // shared workspace chat room.
    //
    // Revoking access is a DIFFERENT operation — removeFromWorkspace, below.
    // Conflating the two is what made the old code evict people on team delete.
    //
    // The strip runs INSIDE the transaction: `teamIds` is a scalar array with no
    // foreign key, so nothing else will clean it up if this is missed.
    await prisma.$transaction(async (tx) => {
      await tx.teamInvite.deleteMany({ where: { teamId } });
      await removeTeamFromMembers(tx, teamId);
      // bug-096: the team's OWN conversation goes with the team — it is that
      // group's chat, and the Teams tab entry disappears with it. Safe only now
      // that rooms are per-team; before this, closing "the room" would have
      // closed the shared one and silenced every other team in the workspace.
      // Soft-delete, so the history survives for support/audit.
      await closeTeamRoom(tx, teamId);
      await tx.team.delete({ where: { id: teamId } });
    });
  }

  /**
   * Everyone in a workspace — the "Workspace Users" list. This is the roster
   * that survives team deletion, which is exactly why it needs its own view:
   * a person with no teams left is invisible on every per-team list but still
   * has full access here.
   *
   * Only the workspace owner may read it (it is their tenant).
   */
  async listWorkspaceMembers(
    actingUserId,
    requestedWorkspaceId = null,
    appContext = "team",
  ) {
    // The roster follows the ACTIVE workspace, like every other list on the
    // page. It used to be hardcoded to the caller's own workspace, so a member
    // switched into someone else's tenant saw two different workspaces on one
    // screen: the header and the teams list showed the tenant, while
    // "All Teammates" showed their own (empty) workspace with themselves
    // labelled Owner.
    //
    // resolveWorkspaceId verifies the claim server-side and falls back to the
    // caller's own workspace, so a forged header cannot read a stranger's
    // roster — same rule the flows/shapes/projects lists use.
    const workspaceId = await resolveWorkspaceId(
      actingUserId,
      requestedWorkspaceId,
    );
    // Only the owner may MANAGE the roster (role changes, removals). Members
    // get a read-only view; the frontend hides the actions on this flag and the
    // write endpoints enforce it independently.
    // bug-112: two different permissions, deliberately not one flag.
    //   canManage      → remove people, manage teams (OWNER + ADMIN)
    //   canManageRoles → promote/demote (OWNER only — an admin must not be able
    //                    to mint more admins, or demote the ones above them)
    const isWorkspaceOwner = workspaceId === actingUserId;
    let isWorkspaceAdmin = false;
    if (!isWorkspaceOwner) {
      const adminSeat = await prisma.teamMember.findFirst({
        where: {
          userId: actingUserId,
          workspaceId,
          role: "ADMIN",
          // The roster is already app-scoped below; the permission must be too.
          appContext: appContext === "pro" ? "pro" : "team",
        },
        select: { id: true },
      });
      isWorkspaceAdmin = !!adminSeat;
    }
    const canManage = isWorkspaceOwner || isWorkspaceAdmin;
    const canManageRoles = isWorkspaceOwner;

    // Seats are per-app (owner decision, 2026-08-08), so the roster is the
    // people holding a seat in THIS workspace in THIS app.
    //
    // This supersedes the app-agnostic roster decided earlier the same day.
    // That decision existed because app-filtering used to be done on the TEAMS
    // a person held, so deleting the last pro team stranded them — full access,
    // invisible in the Pro app. The seat row itself now carries the app, so a
    // person with a pro seat stays visible in Pro even with no teams at all:
    // the stranding problem is solved by the column, not by showing everyone.
    //
    // Filtering here also removes a duplicate the split created — the workspace
    // owner holds BOTH a pro and a team seat, so an unfiltered query listed them
    // twice ("test123 / test123 / spiderman123" in the Pro app).
    const rows = await prisma.teamMember.findMany({
      where: { workspaceId, appContext: appContext === "pro" ? "pro" : "team" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            // Surfaced so the "Add Members" picker can explain why someone
            // cannot be added to a PRO team, instead of letting the click fail
            // with a 402 the user has to decode.
            hasPro: true,
            proPurchasedAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Resolve team names so the UI can show which groups each person is in —
    // and, crucially, show an empty list for someone whose teams were deleted.
    //
    // App isolation applies to the TEAM NAMES, not to the people. Membership
    // rows are app-agnostic (one row per person per workspace), so a member can
    // hold teams in both apps; each app must show only its own. Mirrors
    // getTeams: the Pro app sees only pro teams, the Team app everything else,
    // and system billing shells are hidden in both. Someone whose teams all
    // live in the other app resolves to an empty `teams` array — they still
    // appear in the roster, which is the point (see below).
    const callingIsPro = appContext === "pro";
    const allTeamIds = [...new Set(rows.flatMap((r) => r.teamIds || []))];
    const teams = allTeamIds.length
      ? await prisma.team.findMany({
          where: {
            id: { in: allTeamIds },
            deletedAt: null,
            ...(callingIsPro
              ? { appContext: "pro" }
              : { appContext: { not: "pro" } }),
            OR: [{ verifyTeam: null }, { verifyTeam: { not: "system" } }],
          },
          select: { id: true, name: true },
        })
      : [];
    const nameOf = new Map(teams.map((t) => [t.id, t.name]));

    const memberRows = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      user: r.user,
      role: r.role,
      hasPro: !!(r.user?.hasPro && r.user?.proPurchasedAt),
      isOwner: r.userId === workspaceId,
      joinedAt: r.createdAt,
      teams: (r.teamIds || [])
        .filter((id) => nameOf.has(id))
        .map((id) => ({ id, name: nameOf.get(id) || "Unnamed Team" })),
    }));

    // Owner decision (2026-08-08) — "All Teammates" is the WORKSPACE roster, so
    // it lists everyone holding a membership row, in BOTH apps. Only the `teams`
    // column above is app-filtered.
    //
    // This list used to be filtered by app too: no team in the calling app meant
    // no row. That stranded people. Deleting the last pro team strips the label
    // (CHANGE-001: delete removes the grouping, never the person), so the member
    // still had full workspace access but vanished from the Pro app's only
    // roster — the owner could no longer see them, re-add them to a team, or
    // remove them. The row was reachable solely from the Team app, and only if
    // the person happened to hold a team-app team as well.
    //
    // Hiding them was never an isolation control either: what a member can SEE
    // and DO is decided by the per-request workspace scope, not by this list.
    // This is the owner's management view of their own workspace, showing names
    // they already put there.
    //
    // The switcher (`getMyContexts`) now agrees with this list: both key on the
    // MEMBERSHIP ROW alone and offer the workspace in both apps (owner decision,
    // 2026-08-08). It briefly required a team in the calling app, which made a
    // person listed in the Pro roster unable to enter the Pro workspace — and
    // was unsatisfiable there anyway, since a Pro plan's only team is a hidden
    // `verifyTeam: "system"` billing shell.
    const members = memberRows;

    return { members, workspaceId, canManage, canManageRoles };
  }

  /**
   * Remove a person from a workspace entirely — the only way to revoke access.
   * Deleting every team they belong to does NOT do this, by design.
   */
  async removeUserFromWorkspace(
    workspaceId,
    targetUserId,
    actingUserId,
    appContext = "team",
  ) {
    const seatApp = appContext === "pro" ? "pro" : "team";
    // bug-112: ADMINs may remove people from the workspace, not just the owner.
    if (workspaceId !== actingUserId) {
      const admin = await prisma.teamMember.findFirst({
        where: {
          userId: actingUserId,
          workspaceId,
          role: "ADMIN",
          appContext: seatApp,
        },
        select: { id: true },
      });
      if (!admin) {
        throw new AppError(
          "Only the workspace owner or an admin can remove people from it",
          403,
          "FORBIDDEN",
        );
      }
    }
    if (targetUserId === workspaceId) {
      throw new AppError(
        "The workspace owner cannot be removed from their own workspace",
        400,
        "CANNOT_REMOVE_OWNER",
      );
    }
    // Owner decision: OWNER and ADMIN seats are protected in All Teammates —
    // demote to MEMBER first, then remove. Without this an admin could remove a
    // fellow admin (or the owner's other admins) unilaterally, and two admins
    // could remove each other.
    const targetSeats = await prisma.teamMember.findMany({
      where: { userId: targetUserId, workspaceId, appContext: seatApp },
      select: { role: true },
    });
    if (targetSeats.some((t) => t.role === "OWNER" || t.role === "ADMIN")) {
      throw new AppError(
        "Admins and owners cannot be removed here. Change their role to Member first.",
        403,
        "CANNOT_REMOVE_PRIVILEGED",
      );
    }
    const removed = await removeFromWorkspace(prisma, {
      userId: targetUserId,
      workspaceId,
    });
    // Access is gone, so every room in this workspace goes with it — bug-096
    // made rooms per-team, so there can be several.
    await removeUserFromAllWorkspaceRooms(prisma, workspaceId, targetUserId);
    return removed;
  }

  async getMemberCount(teamId) {
    return await teamMemberCount(teamId);
  }

  async getMembers(teamId, userId) {
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        ...(await visibleTeamsWhere(userId)),
      },
    });
    if (!team) throw new AppError("Team not found", 404, "NOT_FOUND");

    return await teamMemberRows(teamId, { includeUser: true });
  }

  async addMember(teamId, userId, email, appType) {
    const team = await prisma.team.findFirst({
      where: { id: teamId, teamOwnerId: userId },
    });
    if (!team)
      throw new AppError("Team not found or not owner", 404, "NOT_FOUND");

    // Pro lifetime owners: unlimited team members (skip seat-limit check).
    const owner = await prisma.user.findUnique({
      where: { id: userId },
      select: { hasPro: true, proPurchasedAt: true },
    });
    const isProOwner = !!(owner?.hasPro && owner?.proPurchasedAt);

    // Check member limit (skip for Pro lifetime owners). Seat limit is the
    // owner's purchased subscription seat count (usersCount), defaulting to 5.
    if (!isProOwner) {
      const ownerSub = await prisma.subscription.findFirst({
        where: { userId: team.teamOwnerId, status: "active" },
        select: { usersCount: true },
      });
      const seatLimit = ownerSub?.usersCount || 5;
      const memberCount = await teamMemberCount(teamId);
      if (memberCount >= seatLimit) {
        throw new AppError(
          `Team member limit reached (${seatLimit}). Upgrade your plan for more seats.`,
          403,
          "MEMBER_LIMIT_REACHED",
        );
      }
    }

    const targetUser = await prisma.user.findUnique({ where: { email } });
    if (!targetUser)
      throw new AppError(
        "User not found with that email",
        404,
        "USER_NOT_FOUND",
      );

    // A pro-context team may only contain people who own Pro. The invite path
    // already enforced this (verifyInvite / acceptInvite → 402 PRO_REQUIRED);
    // adding directly by email bypassed it entirely, so a free user could be
    // dropped straight into a Pro team and would then hit 403 on every Pro
    // route — a member of a team they cannot actually use.
    if (team.appContext === "pro") {
      if (!targetUser.hasPro || !targetUser.proPurchasedAt) {
        throw new AppError(
          "This team uses ValueChart Pro. That user must purchase Pro before joining.",
          402,
          "PRO_REQUIRED",
        );
      }
    }

    const existing = await prisma.teamMember.findFirst({
      where: { teamIds: { has: teamId }, userId: targetUser.id },
    });
    if (existing)
      throw new AppError("User is already a team member", 409, "CONFLICT");

    // Appends to their existing row in this workspace if they are already in
    // one of the owner's other teams; creates the row otherwise.
    await addTeamToMember(prisma, {
      userId: targetUser.id,
      workspaceId: team.teamOwnerId,
      teamId,
      role: "MEMBER",
      // Added THROUGH a team, so the seat lives in that team's app.
      appContext: team.appContext || "team",
    });
    // Read back the seat we just wrote — which is the one in THIS team's app.
    // The old `userId_workspaceId` compound key no longer exists (seats became
    // per-app on 2026-08-08) and would throw at runtime.
    const member = await prisma.teamMember.findUnique({
      where: {
        userId_workspaceId_appContext: {
          userId: targetUser.id,
          workspaceId: team.teamOwnerId,
          appContext: team.appContext === "pro" ? "pro" : "team",
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    // Increment count
    await prisma.team.update({
      where: { id: teamId },
      data: { countMem: { increment: 1 } },
    });

    // bug-093: same reason as acceptInvite — room membership must track team
    // membership, or this user's sidebar shows the team with no conversation.
    // owner-as-workspace: the room is keyed on the WORKSPACE (the team owner),
    // and is shared across every team that owner runs.
    await addUserToTeamRoom(prisma, team.teamOwnerId, teamId, targetUser.id);

    return member;
  }

  async removeMember(teamId, memberUserId, requestingUserId) {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new AppError("Team not found", 404, "NOT_FOUND");

    // Fix 5: Expand RBAC — both OWNER and ADMIN roles may remove members,
    // matching the permission model already in place for invites.
    const isOwner = team.teamOwnerId === requestingUserId;
    if (!isOwner) {
      const adminMembership = await prisma.teamMember.findFirst({
        where: {
          teamIds: { has: teamId },
          userId: requestingUserId,
          role: { in: ["OWNER", "ADMIN"] },
        },
      });
      if (!adminMembership) {
        throw new AppError(
          "Only team owners and admins can remove members",
          403,
          "FORBIDDEN",
        );
      }
    }

    if (memberUserId === requestingUserId) {
      throw new AppError(
        "Cannot remove yourself from the team",
        400,
        "BAD_REQUEST",
      );
    }

    const member = await prisma.teamMember.findFirst({
      where: { teamIds: { has: teamId }, userId: memberUserId },
    });
    if (!member)
      throw new AppError("Member not found in team", 404, "NOT_FOUND");

    // CHANGE-001. Removing someone from a team strips THAT LABEL AND NOTHING
    // ELSE. They keep the workspace, its flows and its chat, and stay on the
    // workspace roster with one fewer team — possibly with none at all, which
    // is a perfectly normal state.
    //
    // An earlier version of this deleted the membership row when it was their
    // last team, reasoning that removing a named person is a statement about
    // that person. That was WRONG and the owner caught it: taking Spiderman out
    // of his only team made him vanish from the workspace entirely. "Remove
    // from a team" and "remove from the workspace" are two different
    // operations, and only removeUserFromWorkspace revokes access.
    await removeMemberFromTeam(prisma, { userId: memberUserId, teamId });

    await prisma.team.update({
      where: { id: teamId },
      data: { countMem: { decrement: 1 } },
    });

    // bug-096: rooms are per TEAM, so leaving this team means leaving THIS
    // team's conversation — and only that one. Their other teams' rooms are
    // untouched, and they keep the workspace itself (CHANGE-001).
    await removeUserFromTeamRoom(
      prisma,
      team.teamOwnerId,
      teamId,
      memberUserId,
    );

    // ── P1: tell the removed member, by every channel, + leave an audit trail.
    // All best-effort: a comms/audit failure must never undo the removal.
    const removedUser = await prisma.user.findUnique({
      where: { id: memberUserId },
      select: { email: true, name: true },
    });
    const teamName = team.name || "your team";

    // 1. Audit trail (immutable user_actions row).
    try {
      await prisma.userAction.create({
        data: {
          action: "team_member_removed",
          actionModel: "Team",
          userId: requestingUserId, // the actor who performed the removal
          appContext: team.appContext || "team",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } catch (err) {
      logger.error(`[Team] audit log (removeMember) failed: ${err.message}`);
    }

    // 2. In-app notification — scoped to the removed member's PERSONAL
    //    workspace (workspaceId: null), since they no longer belong to the team and
    //    a team-scoped notification would be invisible to them.
    try {
      await notificationService.createNotification(
        memberUserId,
        "team_member_removed",
        "Removed from team",
        `You have been removed from "${teamName}".`,
        "/dashboard/teams",
        { teamId, teamName: team.name || null, removedBy: requestingUserId },
        team.appContext || "team", // appContext
        null, // workspaceId null → lands in their personal workspace
      );
    } catch (err) {
      logger.error(`[Team] removal notification failed: ${err.message}`);
    }

    // 3. Email.
    if (removedUser?.email) {
      try {
        await sendEmail({
          to: removedUser.email,
          subject: `You have been removed from ${teamName}`,
          html: `<p>Hi ${removedUser.name || "there"},</p>
<p>You have been removed from the team <strong>${teamName}</strong> on ValueChart.</p>
<p>You no longer have access to that team's workspace. Your personal flows and data are unaffected.</p>`,
          text: `You have been removed from the team "${teamName}" on ValueChart. Your personal flows and data are unaffected.`,
        });
      } catch (err) {
        logger.error(`[Team] removal email failed: ${err.message}`);
      }
    }
  }

  /**
   * Owner-only role assignment. The team owner may promote a member to ADMIN
   * or demote back to MEMBER. OWNER is NOT assignable here (ownership transfer
   * is a separate concern), and the owner cannot change their own role.
   */
  async updateMemberRole(teamId, targetUserId, requestingUserId, role) {
    // Team must exist (404), then owner-only authorization (403) — mirrors the
    // removeMember ownership model rather than the membership-based gate.
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new AppError("Team not found", 404, "NOT_FOUND");
    if (team.teamOwnerId !== requestingUserId) {
      throw new AppError(
        "Only the team owner can change member roles",
        403,
        "FORBIDDEN",
      );
    }

    // Only ADMIN/MEMBER are assignable via this endpoint.
    if (role !== "ADMIN" && role !== "MEMBER") {
      throw new AppError(
        "Role must be 'ADMIN' or 'MEMBER'",
        400,
        "BAD_REQUEST",
      );
    }

    // Owner cannot change their own role.
    if (targetUserId === requestingUserId) {
      throw new AppError("Cannot change your own role", 400, "BAD_REQUEST");
    }

    const member = await prisma.teamMember.findFirst({
      where: { teamIds: { has: teamId }, userId: targetUserId },
    });
    if (!member)
      throw new AppError("Member not found in team", 404, "NOT_FOUND");

    return prisma.teamMember.update({
      where: { id: member.id },
      data: { role },
    });
  }

  /**
   * P1 — Invitee declines a pending team invite. Token-based and mirrors
   * acceptInvite's guards (valid, pending, not expired, email matches the
   * caller). Marks the invite `declined` and notifies the inviter in real time.
   */
  async declineInvite(token, userId) {
    const invite = await prisma.teamInvite.findUnique({ where: { token } });
    if (!invite) throw new AppError("Invalid invitation", 404, "NOT_FOUND");
    if (invite.status !== "pending")
      throw new AppError("Invitation already used", 400, "BAD_REQUEST");

    const decliningUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (!decliningUser) throw new AppError("User not found", 404, "NOT_FOUND");

    // Only the addressed invitee may decline (same guard as acceptInvite).
    if (decliningUser.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new AppError(
        `This invitation was sent to ${invite.email}.`,
        403,
        "EMAIL_MISMATCH",
      );
    }

    await prisma.teamInvite.update({
      where: { id: invite.id },
      data: { status: "declined" },
    });

    const team = await prisma.team.findUnique({
      where: { id: invite.teamId },
      select: { id: true, name: true, appContext: true },
    });

    // Notify the inviter that their invite was declined. Non-blocking.
    if (invite.invitedBy) {
      try {
        await notificationService.createNotification(
          invite.invitedBy,
          "team_invite_declined",
          "Invitation declined",
          `${decliningUser.name || invite.email} declined your invitation to "${
            team?.name || "your team"
          }".`,
          `/dashboard/teams/${invite.teamId}`,
          {
            teamId: invite.teamId,
            teamName: team?.name || null,
            declinedBy: userId,
            declinedEmail: invite.email,
          },
          team?.appContext || "team", // appContext
          invite.teamId, // scope to the team's workspace
        );
      } catch (err) {
        logger.error(`[Team] decline notification failed: ${err.message}`);
      }
    }

    return { teamId: invite.teamId, status: "declined" };
  }

  async createInvite(teamId, userId, emails, appContext = "team") {
    // Fix 1: Normalize and deduplicate ALL emails upfront before any DB I/O.
    // This eliminates case-sensitivity race conditions where "User@Test.com"
    // and "user@test.com" could bypass duplicate checks and flood the mail server.
    const normalized = [
      ...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
    ];
    if (normalized.length === 0) {
      throw new AppError("No valid emails provided", 400, "BAD_REQUEST");
    }

    // The resolved team (owner row or member row). MUST be declared — class
    // methods run in strict mode, so the bare `inviteTeam = ...` assignments
    // below otherwise throw ReferenceError and every invite 500s.
    let inviteTeam;
    // Check team exists and user has permission (owner check first, then role-based)
    const team = await prisma.team.findFirst({
      where: { id: teamId, teamOwnerId: userId },
    });
    if (!team) {
      // Not the owner — check if user has ADMIN or OWNER role as a member
      const teamByMember = await prisma.team.findUnique({
        where: { id: teamId },
      });
      if (!teamByMember) throw new AppError("Team not found", 404, "NOT_FOUND");
      const membership = await prisma.teamMember.findFirst({
        where: {
          teamIds: { has: teamId },
          userId,
          role: { in: ["OWNER", "ADMIN"] },
        },
      });
      if (!membership)
        throw new AppError(
          "Only team owners and admins can invite members",
          403,
          "FORBIDDEN",
        );
      inviteTeam = teamByMember;
    } else {
      inviteTeam = team;
    }

    const inviter = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    // Fix 2: Block self-invite. Fetch the inviter's canonical email from the
    // DB (not from the token) and reject if it appears in the invite list.
    const inviterEmail = inviter?.email?.toLowerCase();
    if (inviterEmail && normalized.includes(inviterEmail)) {
      throw new AppError(
        "You cannot invite yourself to a team",
        400,
        "SELF_INVITE",
      );
    }

    const baseUrl =
      process.env.APP_URL ||
      process.env.FRONTEND_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";
    const results = [];

    for (const trimmed of normalized) {
      // Check if already a member
      const existingUser = await prisma.user.findUnique({
        where: { email: trimmed },
      });
      if (existingUser) {
        const existingMember = await prisma.teamMember.findFirst({
          where: { teamIds: { has: teamId }, userId: existingUser.id },
        });
        if (existingMember) {
          // If single email invite, throw error for clear frontend feedback
          if (normalized.length === 1) {
            throw new AppError(
              "This email is already a member of this team",
              409,
              "ALREADY_MEMBER",
            );
          }
          results.push({ email: trimmed, status: "already_member" });
          continue;
        }
      }

      // Check for existing pending invite
      const existingInvite = await prisma.teamInvite.findFirst({
        where: {
          teamId,
          email: trimmed,
          status: "pending",
          expiresAt: { gt: new Date() },
        },
      });
      if (existingInvite) {
        results.push({ email: trimmed, status: "already_invited" });
        continue;
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const invite = await prisma.teamInvite.create({
        data: {
          teamId,
          email: trimmed,
          token,
          status: "pending",
          invitedBy: userId,
          role: "MEMBER",
          appContext: inviteTeam.appContext || appContext,
          expiresAt,
        },
      });

      const acceptUrl = `${baseUrl}/invite/accept?token=${token}`;

      try {
        await sendTeamInviteEmail({
          to: trimmed,
          teamName: inviteTeam.name || `Team #${inviteTeam.id.slice(-6)}`,
          inviterName: inviter?.name || "A team member",
          inviterEmail: inviter?.email,
          acceptUrl,
          appContext: inviteTeam.appContext || appContext,
        });
        results.push({ email: trimmed, status: "sent", inviteId: invite.id });
      } catch {
        results.push({
          email: trimmed,
          status: "email_failed",
          inviteId: invite.id,
          acceptUrl,
        });
      }

      // Best-effort FCM push if the invitee already has an account + token.
      try {
        if (existingUser) {
          const fcm = require("./fcm.service");
          const isProInvite = (inviteTeam.appContext || appContext) === "pro";
          await fcm.sendToUser(
            existingUser.id,
            `${inviter?.name || "Someone"} invited you to a team`,
            `Join ${inviteTeam.name || "their team"} on ValueChart${isProInvite ? " Pro" : ""}`,
            {
              type: "team_invite",
              token,
              url: `/invite/accept?token=${token}`,
            },
          );
        }
      } catch {
        // never block invite on FCM failure
      }

      // In-app notification — only possible when the invitee already has an
      // account (no userId to attach one to otherwise; they still get email).
      if (existingUser) {
        try {
          await notificationService.createNotification(
            existingUser.id,
            "team_invite",
            "Team Invitation",
            `${inviter?.name || "A team member"} invited you to join "${
              inviteTeam.name || "a team"
            }"`,
            `/invite/accept?token=${token}`,
            {
              teamId,
              teamName: inviteTeam.name || null,
              inviterName: inviter?.name || null,
              inviteToken: token,
            },
          );
        } catch {
          // never block invite on notification failure
        }
      }
    }

    return results;
  }

  async verifyInvite(token) {
    if (!token) throw new AppError("Token required", 400, "BAD_REQUEST");

    const invite = await prisma.teamInvite.findUnique({
      where: { token },
      include: {
        team: { select: { id: true, name: true, appContext: true } },
        inviter: { select: { id: true, name: true, email: true } },
      },
    });

    if (!invite) throw new AppError("Invalid invitation", 404, "INVALID");

    if (invite.status === "accepted") {
      throw new AppError(
        "Invitation already accepted",
        400,
        "ALREADY_ACCEPTED",
      );
    }

    if (
      invite.status === "expired" ||
      new Date() > new Date(invite.expiresAt)
    ) {
      if (invite.status !== "expired") {
        await prisma.teamInvite.update({
          where: { id: invite.id },
          data: { status: "expired" },
        });
      }
      throw new AppError("Invitation has expired", 400, "EXPIRED");
    }

    // Fix 4: Move the Pro paywall gate to the preview stage so non-Pro users
    // are blocked before the token is consumed at acceptance. Throws 402 here
    // rather than returning a soft `requiresProPurchase` flag.
    const inviteAppContext =
      invite.appContext || invite.team?.appContext || "free";
    if (inviteAppContext === "pro") {
      const invitee = await prisma.user.findUnique({
        where: { email: invite.email.toLowerCase() },
        select: { hasPro: true, proPurchasedAt: true },
      });
      if (!invitee?.hasPro || !invitee?.proPurchasedAt) {
        throw new AppError(
          "This team uses ValueChart Pro. Purchase Pro ($1 lifetime) to join.",
          402,
          "PRO_REQUIRED",
        );
      }
    }

    return {
      teamName: invite.team?.name || "Unknown Team",
      teamId: invite.team?.id,
      inviterName:
        invite.inviter?.name || invite.inviter?.email || "A team member",
      inviterEmail: invite.inviter?.email,
      appContext: inviteAppContext,
      role: invite.role,
      email: invite.email,
    };
  }

  async acceptInvite(token, userId) {
    const invite = await prisma.teamInvite.findUnique({ where: { token } });
    if (!invite) throw new AppError("Invalid invitation", 404, "NOT_FOUND");
    if (invite.status !== "pending")
      throw new AppError("Invitation already used", 400, "BAD_REQUEST");
    if (invite.expiresAt < new Date()) {
      await prisma.teamInvite.update({
        where: { id: invite.id },
        data: { status: "expired" },
      });
      throw new AppError("Invitation has expired", 400, "EXPIRED");
    }

    // Verify the accepting user's email matches the invitation
    const acceptingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, hasPro: true, proPurchasedAt: true },
    });
    if (!acceptingUser) throw new AppError("User not found", 404, "NOT_FOUND");

    if (acceptingUser.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new AppError(
        `This invitation was sent to ${invite.email}. Please log in with that email to accept.`,
        403,
        "EMAIL_MISMATCH",
      );
    }

    // Pro-app invites require the lifetime $1 entitlement before joining.
    // Caller should hand the user off to /invite/pro-purchase first.
    if (
      invite.appContext === "pro" &&
      (!acceptingUser.hasPro || !acceptingUser.proPurchasedAt)
    ) {
      throw new AppError(
        "This team uses ValueChart Pro. Purchase Pro ($1 lifetime) to join.",
        402,
        "PRO_REQUIRED",
      );
    }

    // Check if user is already a member of this team
    const existing = await prisma.teamMember.findFirst({
      where: { teamIds: { has: invite.teamId }, userId },
    });
    if (existing) {
      // Mark invite as accepted but inform the user
      await prisma.teamInvite.update({
        where: { id: invite.id },
        data: {
          status: "accepted",
          acceptedBy: userId,
          acceptedAt: new Date(),
        },
      });
      return {
        alreadyMember: true,
        teamId: invite.teamId,
        appContext: invite.appContext,
      };
    }

    const team = await prisma.team.findUnique({ where: { id: invite.teamId } });
    if (!team) throw new AppError("Team no longer exists", 404, "NOT_FOUND");

    // Determine app context — never allow NULL
    const memberAppContext = invite.appContext || team.appContext || "free";

    await prisma.$transaction(async (tx) => {
      // Joins the invitee to the OWNER'S workspace — creating their membership
      // row there if this is their first team in it, appending otherwise.
      await addTeamToMember(tx, {
        userId,
        workspaceId: team.teamOwnerId,
        teamId: invite.teamId,
        role: invite.role || "MEMBER",
        // The invite already carries the app it was sent from; persist it on
        // the seat instead of discarding it (owner decision, 2026-08-08).
        appContext: memberAppContext,
      });
      await tx.team.update({
        where: { id: invite.teamId },
        data: { countMem: { increment: 1 } },
      });
      await tx.teamInvite.update({
        where: { id: invite.id },
        data: {
          status: "accepted",
          acceptedBy: userId,
          acceptedAt: new Date(),
        },
      });
      // bug-093: chat.service scopes groups by chat_group_users membership, so
      // a member who joins AFTER the room was created would never see it —
      // their sidebar shows conversationId: null, clicking re-runs the
      // owner/admin-only create and 403s. Join the room with the team.
      await addUserToTeamRoom(tx, team.teamOwnerId, invite.teamId, userId);
    });

    // Notify the team owner that a new member joined (skip if the owner
    // somehow accepted their own invite). Non-blocking.
    if (team.teamOwnerId && team.teamOwnerId !== userId) {
      try {
        await notificationService.createNotification(
          team.teamOwnerId,
          "team_member_joined",
          "New Team Member",
          `${acceptingUser.name || acceptingUser.email} joined "${
            team.name || "your team"
          }"`,
          `/dashboard/teams/${team.id}`,
          {
            teamId: team.id,
            teamName: team.name || null,
            memberId: userId,
            memberName: acceptingUser.name || null,
            memberEmail: acceptingUser.email,
          },
          team.appContext || "team", // appContext
          team.id, // workspaceId — scope to the team's workspace
        );
      } catch {
        // never block invite acceptance on notification failure
      }

      // FCM push so the owner is reached even when offline or viewing a
      // different workspace (the in-app bell is strictly workspace-scoped
      // by design — see notification.service buildScope). Same
      // createNotification + sendPushToUser pairing as chat/subscription.
      try {
        const push = require("./push.service");
        await push.sendPushToUser(
          team.teamOwnerId,
          {
            title: "New Team Member",
            body: `${acceptingUser.name || acceptingUser.email} joined "${
              team.name || "your team"
            }"`,
            data: {
              type: "team_member_joined",
              teamId: team.id,
              url: `/dashboard/teams/${team.id}`,
            },
          },
          team.appContext || "team",
          "team_member_joined",
        );
      } catch {
        // never block invite acceptance on push failure
      }
    }

    return { teamId: invite.teamId, appContext: memberAppContext };
  }

  async listPendingInvites(teamId, userId) {
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        ...(await visibleTeamsWhere(userId)),
      },
    });
    if (!team) throw new AppError("Team not found", 404, "NOT_FOUND");

    return await prisma.teamInvite.findMany({
      where: { teamId, status: "pending", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
  }

  async cancelInvite(inviteId, userId) {
    // Invite must exist (404), then owner-only authorization (403) — mirrors the
    // ownership model used by updateMemberRole/deleteTeam.
    const invite = await prisma.teamInvite.findUnique({
      where: { id: inviteId },
    });
    if (!invite) throw new AppError("Invite not found", 404, "NOT_FOUND");

    const team = await prisma.team.findUnique({
      where: { id: invite.teamId },
    });
    if (!team) throw new AppError("Team not found", 404, "NOT_FOUND");
    if (team.teamOwnerId !== userId) {
      throw new AppError(
        "Only the team owner can cancel invites",
        403,
        "FORBIDDEN",
      );
    }

    if (invite.status !== "pending") {
      throw new AppError(
        "Only pending invites can be cancelled",
        400,
        "BAD_REQUEST",
      );
    }

    await prisma.teamInvite.delete({ where: { id: inviteId } });
    return { id: inviteId };
  }
}

module.exports = new TeamService();
