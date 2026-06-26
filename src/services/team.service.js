const { prisma } = require("../lib/prisma");
const AppError = require("../utils/AppError");
const crypto = require("crypto");
const { sendTeamInviteEmail, sendEmail } = require("../utils/email");
const notificationService = require("./notification.service");
const logger = require("../utils/logger");

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
      // Team workspace context: show teams owned by the workspace owner where
      // this user is a member. This lets mr5 see mry's teams only when mr5
      // has explicitly switched into mry's workspace via the profile switcher.
      const activeTeam = await prisma.team.findFirst({
        where: { id: activeTeamId, deletedAt: null },
        select: { teamOwnerId: true },
      });
      if (activeTeam && activeTeam.teamOwnerId !== userId) {
        // Member context: only show teams within the workspace owner's tenant
        // where the current user is also a member.
        where.teamOwnerId = activeTeam.teamOwnerId;
        where.members = { some: { userId } };
      } else {
        // Owner switched to their own team context — show their own teams.
        where.teamOwnerId = userId;
      }
    } else {
      // Personal workspace (no X-Team-Context): only show teams this user owns.
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

    const [teams, total] = await Promise.all([
      prisma.team.findMany({
        where,
        skip,
        take,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          members: {
            take: 5,
            include: {
              user: { select: { id: true, name: true, image: true } },
            },
          },
          _count: { select: { members: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.team.count({ where }),
    ]);

    return {
      teams,
      total,
      page: Number(page) || 1,
      totalPages: Math.ceil(total / take),
    };
  }

  async getTeamById(teamId, userId, appContext = "team") {
    const where = {
      id: teamId,
      OR: [{ teamOwnerId: userId }, { members: { some: { userId } } }],
    };
    // App-isolation: in Pro app, only Pro-context teams are visible.
    if (appContext === "pro") {
      where.appContext = "pro";
    }
    const team = await prisma.team.findFirst({
      where,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
      },
    });
    if (!team) throw new AppError("Team not found", 404, "NOT_FOUND");
    return team;
  }

  async createTeam(userId, data = {}, appContext = "team") {
    return await prisma.$transaction(async (tx) => {
      const team = await tx.team.create({
        data: {
          name: data.name || null,
          description: data.description || null,
          teamOwnerId: userId,
          appType: data.appType || null,
          appContext,
          status: "active",
          countMem: 1,
        },
        include: { owner: { select: { id: true, name: true, email: true } } },
      });

      // Add owner as first team member
      await tx.teamMember.create({
        data: {
          teamId: team.id,
          userId,
          role: "OWNER",
          appType: data.appType || null,
        },
      });

      return team;
    });
  }

  async updateTeam(teamId, userId, data) {
    const team = await prisma.team.findFirst({
      where: { id: teamId, teamOwnerId: userId },
    });
    if (!team)
      throw new AppError("Team not found or not owner", 404, "NOT_FOUND");

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

    // Cascade: delete invites, members, then team
    await prisma.$transaction([
      prisma.teamInvite.deleteMany({ where: { teamId } }),
      prisma.teamMember.deleteMany({ where: { teamId } }),
      prisma.team.delete({ where: { id: teamId } }),
    ]);
  }

  async getMemberCount(teamId) {
    return await prisma.teamMember.count({ where: { teamId } });
  }

  async getMembers(teamId, userId) {
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        OR: [{ teamOwnerId: userId }, { members: { some: { userId } } }],
      },
    });
    if (!team) throw new AppError("Team not found", 404, "NOT_FOUND");

    return await prisma.teamMember.findMany({
      where: { teamId },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });
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
      const memberCount = await prisma.teamMember.count({ where: { teamId } });
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

    const existing = await prisma.teamMember.findFirst({
      where: { teamId, userId: targetUser.id },
    });
    if (existing)
      throw new AppError("User is already a team member", 409, "CONFLICT");

    const member = await prisma.teamMember.create({
      data: {
        teamId,
        userId: targetUser.id,
        role: "MEMBER",
        appType: appType || team.appType,
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
          teamId,
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
      where: { teamId, userId: memberUserId },
    });
    if (!member)
      throw new AppError("Member not found in team", 404, "NOT_FOUND");

    await prisma.teamMember.delete({ where: { id: member.id } });
    await prisma.team.update({
      where: { id: teamId },
      data: { countMem: { decrement: 1 } },
    });

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
    //    workspace (teamId: null), since they no longer belong to the team and
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
        null, // teamId null → lands in their personal workspace
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
      where: { teamId, userId: targetUserId },
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
        where: { teamId, userId, role: { in: ["OWNER", "ADMIN"] } },
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
          where: { teamId, userId: existingUser.id },
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
      where: { teamId: invite.teamId, userId },
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

    await prisma.$transaction([
      prisma.teamMember.create({
        data: {
          teamId: invite.teamId,
          userId,
          role: invite.role || "MEMBER",
          appType: team.appType || null,
        },
      }),
      prisma.team.update({
        where: { id: invite.teamId },
        data: { countMem: { increment: 1 } },
      }),
      prisma.teamInvite.update({
        where: { id: invite.id },
        data: {
          status: "accepted",
          acceptedBy: userId,
          acceptedAt: new Date(),
        },
      }),
    ]);

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
          team.id, // teamId — scope to the team's workspace
        );
      } catch {
        // never block invite acceptance on notification failure
      }
    }

    return { teamId: invite.teamId, appContext: memberAppContext };
  }

  async listPendingInvites(teamId, userId) {
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        OR: [{ teamOwnerId: userId }, { members: { some: { userId } } }],
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
