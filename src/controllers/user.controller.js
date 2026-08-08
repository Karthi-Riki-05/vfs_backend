const userService = require("../services/user.service");
const asyncHandler = require("../utils/asyncHandler");
const { prisma } = require("../lib/prisma");
const {
  OWNER_PLAN_SELECT,
  planFromSubscription,
  hasProPurchase,
  resolveOwnedPlan,
} = require("../utils/planResolver");

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
    const [activeSub, dbUser] = await Promise.all([
      prisma.subscription.findFirst({
        where: {
          userId,
          status: { in: ["active", "cancelling"] },
          deletedAt: null,
        },
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
        select: {
          currentVersion: true,
          hasPro: true,
          proPurchasedAt: true,
          isLegacyPro: true,
        },
      }),
    ]);

    // A subscription row keeps status='active' even after it lapses — there is
    // NO cron that flips it to 'expired' (status only changes via a Stripe
    // webhook or admin action). So `status:'active'` alone is NOT proof of a
    // live plan: we must also check that the paid period hasn't ended. Without
    // this guard an expired Team/Pro subscriber kept full team entitlements
    // (chat, team switcher) while the dashboard already showed "Expired".
    const subIsLive =
      !!activeSub &&
      (!activeSub.expiresAt || new Date(activeSub.expiresAt) > new Date());

    // Resolve the plan label from OWNERSHIP only:
    // 1. LIVE subscription product_type → team / pro
    // 2. Genuine Pro lifetime purchase  → pro
    // 3. otherwise                      → free
    //
    // bug-086: three promotions used to sit between (1) and (3) and each one
    // handed out a paid plan for free:
    //   • `ownsAnyTeam` — owning an appContext='team' row was taken as proof of
    //     a Team plan. Nothing deletes a team when its subscription lapses, so
    //     an owner who stopped paying kept `currentVersion:'team'`, hasPro and
    //     the whole team feature set PERMANENTLY. It also fired for a free user
    //     who owns a team row at all, which is what the tester hit.
    //   • `currentVersion === 'team' | 'pro'` — that column is the ACTIVE
    //     WORKSPACE, not a receipt (see utils/userTier.js, which deliberately
    //     never reads it). A stale value re-granted the plan on every load.
    //   • bare `hasPro` — flippable by team grants, so it is not proof of the
    //     $1 purchase; resolveOwnedPlan requires proPurchasedAt/isLegacyPro.
    // The result is that `currentVersion` below can no longer disagree with
    // GET /subscription/status, which is what showed "Team Plan" in the header
    // and "Free Plan" on the profile page in the same render.
    const resolvedPlan =
      (subIsLive && planFromSubscription({ ...activeSub, deletedAt: null })) ||
      (hasProPurchase(dbUser) ? "pro" : "free");
    const resolvedHasPro = resolvedPlan !== "free";

    // App-isolation: caller's current workspace decides which teams appear
    // in the switcher. Pro app shows only Pro-context teams; Team app shows
    // only Team-context teams. Reads from query/header/user.currentVersion
    // in that priority so the FE can override during transitions.
    const requestedApp =
      req.query?.appContext ||
      req.headers["x-app-context"] ||
      dbUser?.currentVersion ||
      "free";
    const isProApp = requestedApp === "pro";

    // App-isolation filter shared by both the member and owner queries so
    // a Team-app team never shows up in the Pro app and vice-versa.
    const appCtxTeamFilter = isProApp
      ? { appContext: "pro", deletedAt: null }
      : { appContext: { not: "pro" }, deletedAt: null };

    const ownerSelect = {
      id: true,
      name: true,
      image: true,
      currentVersion: true,
      proUnlimitedFlows: true,
      proFlowLimit: true,
      // bug-086: the plan a team GRANTS is the owner's live subscription.
      ...OWNER_PLAN_SELECT,
    };

    // Two sources of switchable workspaces:
    //   1. Teams the user was INVITED into (TeamMember row, role != OWNER).
    //   2. Teams the user OWNS — owners need a workspace entry too so they
    //      can reach their team's shared flows/projects/chat, not just their
    //      personal (workspaceId IS NULL) workspace. Previously owned teams were
    //      excluded, leaving owners unable to see member-contributed data.
    // CHANGE-001: a membership row carries `teamIds`, not a `team` relation, so
    // the teams are fetched by id and stitched back on to keep the downstream
    // mapper (which reads `mt.team`) unchanged.
    const [membershipRows, ownedTeams] = await Promise.all([
      prisma.teamMember.findMany({
        where: {
          userId,
          role: { not: "OWNER" }, // exclude OWNER membership rows
        },
        select: { role: true, teamIds: true },
      }),
      prisma.team.findMany({
        where: { teamOwnerId: userId, ...appCtxTeamFilter },
        include: { owner: { select: ownerSelect } },
      }),
    ]);

    const memberTeamIdList = [
      ...new Set(membershipRows.flatMap((m) => m.teamIds || [])),
    ];
    const memberTeamRows = memberTeamIdList.length
      ? await prisma.team.findMany({
          where: { id: { in: memberTeamIdList }, ...appCtxTeamFilter },
          include: { owner: { select: ownerSelect } },
        })
      : [];
    const memberTeamById = new Map(memberTeamRows.map((t) => [t.id, t]));
    const memberTeams = membershipRows.flatMap((m) =>
      (m.teamIds || [])
        .map((id) => memberTeamById.get(id))
        .filter(Boolean)
        .map((team) => ({ role: m.role, team })),
    );

    // Shared mapper → the exact TeamContextOption shape the frontend
    // AppContext consumes (workspaceId/teamName/owner/plan/hasPro/…). `isOwner`
    // is additive metadata the FE can use to label the entry.
    const toOption = (team, role) => {
      // Derive the effective plan the team grants from the OWNER's live
      // subscription. bug-086: this used to read `team.appContext` — a
      // workspace label written at team-creation time and never revoked — so
      // every appContext='team' row reported plan:'team', hasPro:true even
      // with no subscription behind it. The old `owner.currentVersion`
      // fallback had the same defect (active workspace, not a receipt).
      const owner = team.owner;
      let plan = resolveOwnedPlan(owner);
      // A pro-context workspace can never grant more than pro, whatever the
      // owner's subscription says.
      if (team.appContext === "pro" && plan === "team") plan = "pro";

      return {
        workspaceId: team.id,
        teamName: team.name,
        role,
        isOwner: role === "OWNER",
        owner: { id: owner.id, name: owner.name, image: owner.image },
        plan,
        hasPro: plan !== "free",
        // Flow perks ride on the plan — an unpaid workspace grants neither.
        proUnlimitedFlows: plan === "free" ? false : owner.proUnlimitedFlows,
        proFlowLimit: owner.proFlowLimit,
      };
    };

    const memberOptions = memberTeams
      // Defensive: drop any team where this user is actually the owner via
      // the Team.teamOwnerId column (in case a role was mis-set).
      .filter(
        (mt) =>
          mt.team &&
          mt.team.deletedAt === null &&
          mt.team.teamOwnerId !== userId,
      )
      .map((mt) => toOption(mt.team, mt.role));

    // Dedup: never list an owned team twice if a stray membership row exists.
    const memberTeamIds = new Set(memberOptions.map((o) => o.workspaceId));
    const ownedOptions = ownedTeams
      .filter((t) => !memberTeamIds.has(t.id))
      .map((t) => toOption(t, "OWNER"));

    // Owned teams lead the switcher (the owner's primary team workspace),
    // followed by teams they were invited into.
    const availableTeams = [...ownedOptions, ...memberOptions];

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
      req.ip,
      req.headers["user-agent"],
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
    await userService.resetPassword(
      req.body.token,
      req.body.password,
      req.ip,
      req.headers["user-agent"],
    );
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

  // ── AI-billing context persistence (WebView-safe) ──
  // Stores which team's AI-credit pool the user last chose to bill. This is a
  // BILLING context only — it never scopes flows/dashboard/chat data, which
  // stay owner-private (DATA-LOSS-001). The frontend mirrors it in
  // localStorage; this server copy survives a WebView kill where
  // session/localStorage may not.

  setActiveContext = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { workspaceId } = req.body || {};
    // App mode decides WHICH context field to write. Prefer the explicit body
    // value (ProGuard posts via raw fetch with appMode:'pro'); fall back to the
    // X-App-Context header (axios attaches it on every request). The Pro app
    // writes lastActiveProTeamId so it never overwrites the Team app's context.
    const appMode = (
      req.body?.appMode ||
      req.headers["x-app-context"] ||
      "team"
    )
      .toString()
      .toLowerCase();

    // Validate: when selecting a team, the caller must be a member OR the
    // owner of it — otherwise we'd let someone bill a team they can't access.
    if (workspaceId) {
      const [membership, ownedTeam] = await Promise.all([
        prisma.teamMember.findFirst({
          where: { workspaceId, userId },
          select: { id: true },
        }),
        prisma.team.findFirst({
          where: { id: workspaceId, teamOwnerId: userId, deletedAt: null },
          select: { id: true },
        }),
      ]);
      if (!membership && !ownedTeam) {
        return res.status(403).json({
          success: false,
          error: {
            code: "NOT_TEAM_MEMBER",
            message: "You are not a member of this team.",
          },
        });
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data:
        appMode === "pro"
          ? { lastActiveProTeamId: workspaceId || null }
          : { lastActiveTeamId: workspaceId || null },
    });

    res.json({ success: true, data: { workspaceId: workspaceId || null } });
  });

  getActiveContext = asyncHandler(async (req, res) => {
    // Read the context for the calling app only. The Pro app gets its own
    // lastActiveProTeamId; everything else (Team app, web) gets lastActiveTeamId
    // — so a proTeamId can never be served to the Team app (cross-app isolation).
    const appMode = (req.headers["x-app-context"] || "team")
      .toString()
      .toLowerCase();
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { lastActiveTeamId: true, lastActiveProTeamId: true },
    });
    const workspaceId =
      appMode === "pro"
        ? user?.lastActiveProTeamId || null
        : user?.lastActiveTeamId || null;
    res.json({
      success: true,
      data: { workspaceId },
    });
  });
}

module.exports = new UserController();
