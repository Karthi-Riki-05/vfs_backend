const teamService = require("../services/team.service");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { prisma } = require("../lib/prisma");
const aiCreditService = require("../services/aiCredit.service");
const { workspaceHeader } = require("../lib/workspaceContext");
const {
  OWNER_PLAN_SELECT,
  resolveOwnedPlan,
} = require("../utils/planResolver");

class TeamController {
  getTeams = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const activeTeamId = workspaceHeader(req) || null;
    const result = await teamService.getTeams(
      req.user.id,
      req.query,
      appContext,
      activeTeamId,
    );
    res.json({ success: true, data: result });
  });

  getTeamById = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const team = await teamService.getTeamById(
      req.params.id,
      req.user.id,
      appContext,
    );
    res.json({ success: true, data: team });
  });

  createTeam = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    // bug-112: the workspace decides who OWNS the team (the workspace owner),
    // so it has to reach the service — an admin creating a team inside someone
    // else's workspace must not end up owning it.
    const team = await teamService.createTeam(
      req.user.id,
      req.body,
      appContext,
      workspaceHeader(req) || null,
    );
    res.status(201).json({ success: true, data: team });
  });

  updateTeam = asyncHandler(async (req, res) => {
    const team = await teamService.updateTeam(
      req.params.id,
      req.user.id,
      req.body,
      req.headers["x-app-context"] || req.user.currentVersion || "team",
    );
    res.json({ success: true, data: team });
  });

  deleteTeam = asyncHandler(async (req, res) => {
    await teamService.deleteTeam(req.params.id, req.user.id);
    res.json({ success: true, data: { message: "Team deleted successfully" } });
  });

  getMembers = asyncHandler(async (req, res) => {
    const members = await teamService.getMembers(req.params.id, req.user.id);
    res.json({ success: true, data: members });
  });

  addMember = asyncHandler(async (req, res) => {
    // Seat-limit enforcement is canonical in teamService.addMember (keyed off
    // the team owner's subscription.usersCount).
    const member = await teamService.addMember(
      req.params.id,
      req.user.id,
      req.body.email,
      req.body.appType,
    );
    res.status(201).json({ success: true, data: member });
  });

  removeMember = asyncHandler(async (req, res) => {
    await teamService.removeMember(req.params.id, req.params.uid, req.user.id);
    res.json({
      success: true,
      data: { message: "Member removed successfully" },
    });
  });

  // CHANGE-001 — workspace-level roster. Distinct from the per-team member
  // lists: a person whose teams were all deleted still belongs to the
  // workspace and appears ONLY here.
  listWorkspaceMembers = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    // Follows the ACTIVE workspace, not the caller's own — otherwise a member
    // switched into someone else's tenant sees their own roster next to that
    // tenant's teams.
    const result = await teamService.listWorkspaceMembers(
      req.user.id,
      workspaceHeader(req) || null,
      appContext,
    );
    res.json({ success: true, data: result });
  });

  // The only way to revoke workspace access. Deleting every team a person is
  // in does NOT remove them — that is the whole point of CHANGE-001.
  removeWorkspaceMember = asyncHandler(async (req, res) => {
    // bug-112: the workspace comes from the CONTEXT, not from the caller's id.
    // Hardcoding `req.user.id` as the workspace meant an ADMIN could only ever
    // act on their OWN workspace — so "remove from workspace" silently operated
    // on the wrong tenant: it deleted nothing and still reported success.
    //
    // The service authorizes against this workspace (owner or admin only), so a
    // forged header lands on a workspace where the caller has no admin seat and
    // is rejected there.
    const workspaceId = workspaceHeader(req) || req.user.id;
    await teamService.removeUserFromWorkspace(
      workspaceId,
      req.params.uid,
      req.user.id,
      req.headers["x-app-context"] || req.user.currentVersion || "team",
    );
    res.json({
      success: true,
      data: { message: "User removed from workspace" },
    });
  });

  updateMemberRole = asyncHandler(async (req, res) => {
    const member = await teamService.updateMemberRole(
      req.params.id,
      req.params.uid,
      req.user.id,
      req.body.role,
    );
    res.json({ success: true, data: member });
  });

  invite = asyncHandler(async (req, res) => {
    const { teamId, email, emails } = req.body;
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    // Support single email or comma-separated list. Guard email.includes —
    // `email` is optional when `emails[]` is supplied (would throw otherwise).
    const emailList = emails
      ? emails
      : email && email.includes(",")
        ? email.split(",").map((e) => e.trim())
        : [email];
    const results = await teamService.createInvite(
      teamId,
      req.user.id,
      emailList,
      appContext,
    );
    res.status(201).json({
      success: true,
      data: { message: "Invitations processed", results },
    });
  });

  verifyInvite = asyncHandler(async (req, res) => {
    const { token } = req.query;
    const data = await teamService.verifyInvite(token);
    res.json({ success: true, data });
  });

  acceptInvite = asyncHandler(async (req, res) => {
    const token = req.query.token || req.body?.token;
    if (!token) throw new AppError("Token required", 400, "BAD_REQUEST");
    const result = await teamService.acceptInvite(token, req.user.id);
    res.json({ success: true, data: result });
  });

  declineInvite = asyncHandler(async (req, res) => {
    const token = req.query.token || req.body?.token;
    if (!token) throw new AppError("Token required", 400, "BAD_REQUEST");
    const result = await teamService.declineInvite(token, req.user.id);
    res.json({ success: true, data: result });
  });

  listPendingInvites = asyncHandler(async (req, res) => {
    const { teamId } = req.query;
    if (!teamId) throw new AppError("teamId required", 400, "BAD_REQUEST");
    const invites = await teamService.listPendingInvites(teamId, req.user.id);
    res.json({ success: true, data: invites });
  });

  cancelInvite = asyncHandler(async (req, res) => {
    await teamService.cancelInvite(req.params.id, req.user.id);
    res.json({
      success: true,
      data: { message: "Invite cancelled successfully" },
    });
  });

  // List the AI-billing contexts the user can switch between: their personal
  // pool plus every team they belong to (or own). Each entry carries its live
  // AI-credit balance, resolved through the SAME billing logic the deduction
  // path uses (aiCreditService.getBalance → resolveBillingUser), so the
  // numbers shown match what will actually be spent. Billing only — this does
  // NOT expose or scope any flow/chat data (DATA-LOSS-001).
  getMyContexts = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    // Determine which app is calling via X-Workspace-Context. When the header
    // carries a proTeamId, we're in pro app context; otherwise (no header or
    // a team-app teamId) we're in team/personal context. We do NOT fall back
    // to currentVersion because it can be stale (e.g. a user with
    // currentVersion='pro' opening the team app with no active team context).
    const activeTeamId = workspaceHeader(req) || null;

    // Guard: x-app-context="team" from the team app must be validated against
    // a real subscription. A free user opening ?app=team has no team plan — fall
    // back to their actual plan so we don't create/show 300 team credits for them.
    let personalCtx =
      req.headers["x-app-context"] || req.user.currentVersion || "free";
    if (personalCtx === "team" && !activeTeamId) {
      const ownsTeamPlan = await prisma.subscription.findFirst({
        where: {
          userId,
          status: { in: ["active", "trialing"] },
          plan: { tier: { gte: 2 } },
        },
        select: { id: true },
      });
      // Fall back to FREE, not `currentVersion`. currentVersion records the
      // user's strongest plan across both apps, so a Pro user opening the TEAM
      // app fell through to "pro" and was shown their 50 Pro credits on the
      // Team dashboard — the other app's pool, which the two apps are supposed
      // to keep apart. No team plan in the team app means the free pool.
      if (!ownsTeamPlan) personalCtx = "free";
    }
    // Which app is calling is stated by X-App-Context, full stop.
    //
    // This used to be OVERRIDDEN by looking the workspace header up in `teams`
    // and reading its appContext — the pre-2026-08-07 world, where that header
    // carried a team id and a team belonged to one app. Since owner-as-workspace
    // it carries a USER id, so the lookup never matched and `callingIsPro` was
    // forced to FALSE on every request that carried a workspace. In the Pro app
    // that meant the workspace row was labelled with the caller's TEAM-app team
    // ("Infinity") and, worse, `getBalance` was asked for the "team" pool — so
    // the Pro dashboard displayed the TEAM AI-credit balance (176 instead of 50).
    //
    // No lookup can replace this: a workspace is now app-agnostic (it holds both
    // Pro and Team content), so only the caller can say which app they are in.
    const callingIsPro = req.headers["x-app-context"] === "pro";

    // Teams the user is a MEMBER of, the team(s) they OWN (used for the
    // own-context label only), and their own AI-credit balance.
    const [user, membershipRows, personalBalance] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        // bug-086: the own-context row must report the plan the caller actually
        // OWNS, not the X-App-Context header they sent.
        select: { name: true, email: true, ...OWNER_PLAN_SELECT },
      }),
      // CHANGE-001: a membership row carries `teamIds`, not a `team` relation,
      // so the teams are fetched separately and stitched back on below. The
      // bug-092 system-shell exclusion moves to that query.
      // THE workspace list. Seats are per-app (owner decision, 2026-08-08):
      // buying a plan creates the row for that plan's app, an invite stamps
      // the app it was sent from. So the calling app is a plain filter on the
      // membership rows — no Team lookup, no inferring the app from
      // structure. This one line is what the column was added for.
      prisma.teamMember.findMany({
        where: { userId, appContext: callingIsPro ? "pro" : "team" },
        select: { role: true, teamIds: true, workspaceId: true },
      }),
      aiCreditService.getBalance(userId, personalCtx, null),
    ]);

    // CHANGE-001: a switcher row is a WORKSPACE, so it is built from the
    // MEMBERSHIP rows — one per workspace — not from teams.
    //
    // This distinction is the whole point of the change and it bit us once: an
    // earlier version expanded memberships per team, so someone whose teams had
    // all been removed (teamIds: []) produced zero rows and lost the switcher
    // entirely, despite still having full access to that workspace.
    //
    // A representative team is still resolved per workspace, but only to supply
    // the label and the app-context filter — never to decide whether the
    // workspace appears at all.
    //
    // bug-092 still applies: `verifyTeam: "system"` teams are billing shells
    // that no surface can work in, so they can never be the representative.
    const joinedWorkspaceIds = [
      ...new Set(
        membershipRows
          .map((m) => m.workspaceId)
          .filter((wsId) => wsId && wsId !== userId),
      ),
    ];

    // Only the OWNERS. A workspace is named after the person who owns it, so
    // `teams` is no longer consulted here at all — see the label note below.
    const workspaceOwners = joinedWorkspaceIds.length
      ? await prisma.user.findMany({
          where: { id: { in: joinedWorkspaceIds } },
          select: { id: true, name: true, email: true, ...OWNER_PLAN_SELECT },
        })
      : [];

    const ownerById = new Map((workspaceOwners || []).map((o) => [o.id, o]));
    // Strongest role the caller holds in each workspace.
    const roleByWorkspace = new Map();
    for (const m of membershipRows) {
      const prev = roleByWorkspace.get(m.workspaceId);
      if (!prev || (prev !== "ADMIN" && m.role === "ADMIN")) {
        roleByWorkspace.set(m.workspaceId, m.role);
      }
    }

    // A team owner bills the SAME pool whether the X-Workspace-Context header is
    // absent or carries their own teamId — resolveBillingUser folds both to
    // { userId, "team" }. So an owned team listed as its own switcher row is a
    // redundant duplicate of the own/personal context. Exclude owned teams
    // from the switchable list and instead surface the owned team's NAME as
    // the own-context label (e.g. "newtest's Team"). This means a team owner
    // with no invites sees no switcher at all (own-only).

    // MEMBERSHIP is the whole rule (owner decision, 2026-08-08). A membership
    // row for (person, workspace) offers that workspace in BOTH apps. Teams are
    // labels, not gates — which is the owner-as-workspace model taken to its
    // conclusion, and what `canEnterWorkspace` has always enforced (it checks
    // the row alone, with no app-context test).
    //
    // This replaces a team-app filter that made the switcher disagree with the
    // roster it is supposed to mirror: "All Teammates" lists everyone holding a
    // row, in both apps, so test123's PRO roster showed spiderman123 while
    // spiderman123's PRO switcher refused to offer test123's workspace. The
    // filter could not be satisfied either, because a Pro plan's only "team" is
    // a `verifyTeam: "system"` billing shell that is hidden everywhere and
    // cannot be joined — so in the Pro app NOBODY ever had a listable team, and
    // the rule denied every Pro workspace to every member.
    //
    // The leak the old filter guarded against was a DIFFERENT rule — "does this
    // workspace contain any pro team?" — which offered a workspace to someone
    // holding no membership in it at all. That cannot happen here: the loop
    // only walks workspaces the caller already has a row in.
    //
    // ⚠️ Consequence, accepted: a member switched into a Pro workspace spends
    // that workspace owner's AI-credit pool (resolveBillingUser), exactly as a
    // member in the Team app already does.
    const byOwner = new Map();
    for (const wsId of joinedWorkspaceIds) {
      const owner = ownerById.get(wsId);
      if (!owner) continue;
      // A workspace is named after the PERSON who owns it (owner decision,
      // 2026-08-08). It used to be named after the first team inside it, so
      // test123's own workspace read "Infinity" — and renaming that team would
      // have renamed the workspace. Teams are labels INSIDE a workspace, never
      // its identity, which is why `teams` is not queried here any more.
      const ownerLabel =
        owner.name || owner.email?.split("@")[0] || "Workspace";
      byOwner.set(wsId, {
        role: roleByWorkspace.get(wsId) || "MEMBER",
        team: {
          // No team id: the switcher row IS a workspace. The response sends
          // `teamId: team.teamOwnerId` anyway, so nothing consumed this.
          id: null,
          name: ownerLabel,
          teamOwnerId: wsId,
          // The app is the one the caller is IN — a workspace holds both Pro
          // and Team content, so no stored value can answer this.
          appContext: callingIsPro ? "pro" : "team",
          owner,
        },
      });
    }

    const teams = await Promise.all(
      [...byOwner.values()].map(async ({ team, role }) => {
        // The WORKSPACE id (owner's user id) — resolveBillingUser keys off the
        // workspace, and `team.id` is null for a workspace with no teams.
        const bal = await aiCreditService.getBalance(
          userId,
          callingIsPro ? "pro" : "team",
          team.teamOwnerId,
        );
        // bug-086: `plan` / `hasPro` were never sent, so the frontend's
        // `matched?.plan || "team"` fallback (AiBillingContext / AppContext)
        // silently granted TEAM to every switched-into workspace. Send the
        // truth — derived from the owner's live subscription — so that
        // fallback can never fire.
        let plan = resolveOwnedPlan(team.owner);
        if (team.appContext === "pro" && plan === "team") plan = "pro";
        return {
          // The WORKSPACE id — the owner's user id. This is what the client
          // echoes back as X-Workspace-Context, and what every workspace_id
          // column now holds. Sending team.id here made chat try to create a
          // room owned by a non-existent user (FOREIGN_KEY_ERROR).
          teamId: team.teamOwnerId,
          workspaceId: team.teamOwnerId,
          label: team.name || `${team.owner?.name || "Team"}'s Team`,
          ownerName: team.owner?.name || null,
          ownerEmail: team.owner?.email || null,
          role,
          plan,
          hasPro: plan !== "free",
          aiCredits: {
            planCredits: bal.planCredits,
            addonCredits: bal.addonCredits,
            total: bal.totalCredits,
          },
        };
      }),
    );

    // Your own workspace is named after YOU, for the same reason. This used to
    // read `ownTeamName || …`, so test123's personal row showed "Infinity".
    const ownLabel = user?.name || user?.email?.split("@")[0] || "Personal";

    res.json({
      success: true,
      data: {
        personal: {
          teamId: null,
          label: ownLabel,
          ownerName: user?.name || null,
          ownerEmail: user?.email || null,
          avatar: ownLabel?.[0]?.toUpperCase() || null,
          // bug-086: was `personalCtx` — an X-App-Context header value, i.e. a
          // client claim. `personalCtx` still selects which AI-credit pool to
          // read (below), but the PLAN reported here is ownership-derived.
          //
          // Clamped to `pro` inside the Pro app, matching the same rule already
          // applied to joined workspaces (user.controller `toOption`). Without
          // it a user who owns a TEAM subscription reported plan:"team" on the
          // personal row while in the PRO app, and the frontend gates features
          // off that value — a team-tier unlock inside the Pro app.
          plan: (() => {
            const owned = resolveOwnedPlan(user);
            return callingIsPro && owned === "team" ? "pro" : owned;
          })(),
          aiCredits: {
            planCredits: personalBalance.planCredits,
            addonCredits: personalBalance.addonCredits,
            total: personalBalance.totalCredits,
          },
        },
        teams,
      },
    });
  });
}

module.exports = new TeamController();
