const teamService = require("../services/team.service");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { prisma } = require("../lib/prisma");
const aiCreditService = require("../services/aiCredit.service");

class TeamController {
  getTeams = asyncHandler(async (req, res) => {
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const activeTeamId = req.headers["x-team-context"] || null;
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
    const team = await teamService.createTeam(
      req.user.id,
      req.body,
      appContext,
    );
    res.status(201).json({ success: true, data: team });
  });

  updateTeam = asyncHandler(async (req, res) => {
    const team = await teamService.updateTeam(
      req.params.id,
      req.user.id,
      req.body,
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
    // Determine which app is calling via X-Team-Context. When the header
    // carries a proTeamId, we're in pro app context; otherwise (no header or
    // a team-app teamId) we're in team/personal context. We do NOT fall back
    // to currentVersion because it can be stale (e.g. a user with
    // currentVersion='pro' opening the team app with no active team context).
    const activeTeamId = req.headers["x-team-context"] || null;

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
      if (!ownsTeamPlan) personalCtx = req.user.currentVersion || "free";
    }
    let callingIsPro = req.headers["x-app-context"] === "pro";
    if (activeTeamId) {
      const activeTeam = await prisma.team.findFirst({
        where: { id: activeTeamId },
        select: { appContext: true },
      });
      callingIsPro = activeTeam?.appContext === "pro";
    }

    // Teams the user is a MEMBER of, the team(s) they OWN (used for the
    // own-context label only), and their own AI-credit balance.
    const [user, memberships, ownedTeams, personalBalance] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      }),
      prisma.teamMember.findMany({
        where: { userId, team: { deletedAt: null } },
        select: {
          role: true,
          team: {
            select: {
              id: true,
              name: true,
              teamOwnerId: true,
              appContext: true,
              owner: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      prisma.team.findMany({
        where: { teamOwnerId: userId, deletedAt: null },
        select: { id: true, name: true },
      }),
      aiCreditService.getBalance(userId, personalCtx, null),
    ]);

    // A team owner bills the SAME pool whether the X-Team-Context header is
    // absent or carries their own teamId — resolveBillingUser folds both to
    // { userId, "team" }. So an owned team listed as its own switcher row is a
    // redundant duplicate of the own/personal context. Exclude owned teams
    // from the switchable list and instead surface the owned team's NAME as
    // the own-context label (e.g. "newtest's Team"). This means a team owner
    // with no invites sees no switcher at all (own-only).
    const ownedTeamIds = new Set(ownedTeams.map((t) => t.id));
    const ownTeamName = ownedTeams[0]?.name || null;

    // Only teams the user was INVITED to (member, not owner), scoped to the
    // calling app — pro teams are only returned when requesting from pro app
    // context, preventing a user's pro-team membership from appearing in the
    // team app switcher (cross-app isolation).
    const joined = memberships.filter(
      (m) =>
        m.team.teamOwnerId !== userId &&
        !ownedTeamIds.has(m.team.id) &&
        (callingIsPro
          ? m.team.appContext === "pro"
          : m.team.appContext !== "pro"),
    );

    const teams = await Promise.all(
      joined.map(async ({ team, role }) => {
        const bal = await aiCreditService.getBalance(userId, "team", team.id);
        return {
          teamId: team.id,
          label: team.name || `${team.owner?.name || "Team"}'s Team`,
          ownerName: team.owner?.name || null,
          ownerEmail: team.owner?.email || null,
          role,
          aiCredits: {
            planCredits: bal.planCredits,
            addonCredits: bal.addonCredits,
            total: bal.totalCredits,
          },
        };
      }),
    );

    const ownLabel =
      ownTeamName || user?.name || user?.email?.split("@")[0] || "Personal";

    res.json({
      success: true,
      data: {
        personal: {
          teamId: null,
          label: ownLabel,
          ownerName: user?.name || null,
          ownerEmail: user?.email || null,
          avatar: ownLabel?.[0]?.toUpperCase() || null,
          plan: personalCtx,
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
