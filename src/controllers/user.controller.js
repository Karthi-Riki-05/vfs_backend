const userService = require("../services/user.service");
const asyncHandler = require("../utils/asyncHandler");
const { prisma } = require("../lib/prisma");

class UserController {
  getMe = asyncHandler(async (req, res) => {
    const user = await userService.getUserById(req.user.id);
    res.json({ success: true, data: user });
  });

  getTeamContext = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // Look up the user's CURRENT active subscription so we can derive their
    // real plan label. The `users.current_version` column is sometimes
    // stale (e.g. user upgraded from Pro → Team Monthly via Stripe but the
    // sync didn't write back to currentVersion). The subscription row is
    // the source of truth.
    const [activeSub, dbUser, ownsAnyTeam] = await Promise.all([
      prisma.subscription.findFirst({
        where: { userId, status: "active", deletedAt: null },
        select: {
          productType: true,
          status: true,
          expiresAt: true,
          plan: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { currentVersion: true, hasPro: true },
      }),
      prisma.team.findFirst({
        where: { teamOwnerId: userId, deletedAt: null },
        select: { id: true },
      }),
    ]);

    // Resolve the plan label in priority order:
    // 1. Active subscription product_type → most authoritative
    // 2. User owns any team             → must be on team plan
    // 3. DB users.current_version       → fallback
    // 4. DB users.has_pro                → free/pro fallback
    let resolvedPlan = "free";
    let resolvedHasPro = false;
    if (activeSub?.productType) {
      const pt = String(activeSub.productType).toLowerCase();
      if (pt.startsWith("team")) {
        resolvedPlan = "team";
        resolvedHasPro = true;
      } else if (pt.startsWith("pro")) {
        resolvedPlan = "pro";
        resolvedHasPro = true;
      }
    } else if (ownsAnyTeam) {
      resolvedPlan = "team";
      resolvedHasPro = true;
    } else if (dbUser?.currentVersion === "team") {
      resolvedPlan = "team";
      resolvedHasPro = true;
    } else if (dbUser?.currentVersion === "pro" || dbUser?.hasPro) {
      resolvedPlan = "pro";
      resolvedHasPro = true;
    }

    // Switcher only makes sense for teams the user was INVITED into —
    // not teams they own. A team owner already has the team plan as
    // their primary account; no switching needed.
    const memberTeams = await prisma.teamMember.findMany({
      where: {
        userId,
        role: { not: "OWNER" }, // exclude OWNER membership rows
      },
      include: {
        team: {
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                image: true,
                hasPro: true,
                currentVersion: true,
                proUnlimitedFlows: true,
                proFlowLimit: true,
              },
            },
          },
        },
      },
    });

    const availableTeams = memberTeams
      // Defensive: also drop any team where this user is actually the
      // owner via the Team.teamOwnerId column (in case role was mis-set).
      .filter(
        (mt) =>
          mt.team &&
          mt.team.deletedAt === null &&
          mt.team.teamOwnerId !== userId,
      )
      .map((mt) => {
        // Derive the effective plan that the team grants its members.
        // If the team's appContext is 'team', or the team has any members
        // (which means the owner is paying for team seats), report 'team'.
        // Otherwise fall back to the owner's hasPro flag, then their
        // currentVersion. This protects against stale currentVersion
        // values where a paid team owner is still flagged 'free'.
        const owner = mt.team.owner;
        let plan = mt.team.appContext;
        if (plan !== "team") {
          if (owner.hasPro) plan = "pro";
          else plan = owner.currentVersion || "free";
        }
        // Owning/being part of a team always unlocks team-collab features
        // for the invited member, regardless of the owner's plan field.
        if (mt.team.appContext === "team") plan = "team";

        return {
          teamId: mt.team.id,
          teamName: mt.team.name,
          role: mt.role,
          owner: {
            id: owner.id,
            name: owner.name,
            image: owner.image,
          },
          plan,
          hasPro: plan === "pro" || plan === "team" || owner.hasPro,
          proUnlimitedFlows: owner.proUnlimitedFlows,
          proFlowLimit: owner.proFlowLimit,
        };
      });

    res.json({
      success: true,
      data: {
        // `currentVersion` is now the RESOLVED plan (subscription-aware),
        // not the raw stale column. `rawCurrentVersion` exposes the
        // underlying users.current_version for debugging if needed.
        personalPlan: {
          currentVersion: resolvedPlan,
          hasPro: resolvedHasPro,
          rawCurrentVersion: dbUser?.currentVersion || "free",
          subscription: activeSub
            ? {
                productType: activeSub.productType,
                planName: activeSub.plan?.name || null,
                status: activeSub.status,
                expiresAt: activeSub.expiresAt,
              }
            : null,
        },
        availableTeams,
      },
    });
  });

  getUserById = asyncHandler(async (req, res) => {
    const user = await userService.getUserById(req.params.id);
    res.json({ success: true, data: user });
  });

  updateUser = asyncHandler(async (req, res) => {
    // Reject multipart uploads — avatar upload via this endpoint is not supported.
    // The frontend settings page sends multipart expecting an avatar handler, but
    // the `photo` field is a String(max 500). Use OAuth profile image or a
    // dedicated upload endpoint instead.
    const ct = req.headers["content-type"] || "";
    if (ct.includes("multipart/form-data")) {
      return res.status(400).json({
        success: false,
        error: {
          code: "AVATAR_UPLOAD_NOT_SUPPORTED",
          message:
            "Avatar upload via this endpoint is not supported. Send a JSON body with a `photo` URL instead.",
        },
      });
    }

    // Owner-or-admin check — prevent one user from editing another's profile.
    const isAdmin =
      req.user.role === "Company Admin" || req.user.role === "super_admin";
    if (req.params.id !== req.user.id && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Cannot update another user's profile.",
        },
      });
    }

    const user = await userService.updateUser(req.params.id, req.body);
    res.json({
      success: true,
      data: { message: "User updated successfully", user },
    });
  });

  changePassword = asyncHandler(async (req, res) => {
    await userService.changePassword(
      req.user.id,
      req.body.currentPassword,
      req.body.newPassword,
    );
    res.json({
      success: true,
      data: { message: "Password changed successfully" },
    });
  });

  forgotPassword = asyncHandler(async (req, res) => {
    await userService.requestPasswordReset(req.body.email);
    res.json({
      success: true,
      data: { message: "If that email exists, a reset link has been sent." },
    });
  });

  resetPassword = asyncHandler(async (req, res) => {
    await userService.resetPassword(req.body.token, req.body.password);
    res.json({
      success: true,
      data: { message: "Password reset successfully" },
    });
  });

  deleteUser = asyncHandler(async (req, res) => {
    await userService.softDeleteUser(req.params.id);
    res.json({
      success: true,
      data: { message: "User deactivated successfully" },
    });
  });
}

module.exports = new UserController();
