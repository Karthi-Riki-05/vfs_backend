const teamService = require("../services/team.service");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");

class TeamController {
  getTeams = asyncHandler(async (req, res) => {
    const appContext = req.user.currentVersion || "free";
    const result = await teamService.getTeams(
      req.user.id,
      req.query,
      appContext,
    );
    res.json({ success: true, data: result });
  });

  getTeamById = asyncHandler(async (req, res) => {
    const team = await teamService.getTeamById(req.params.id, req.user.id);
    res.json({ success: true, data: team });
  });

  createTeam = asyncHandler(async (req, res) => {
    const appContext = req.user.currentVersion || "free";
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
    // Enforce team member limit from subscription
    const teamMemberLimit = req.subscription?.teamMemberLimit || 5;
    const currentCount = await teamService.getMemberCount(req.params.id);
    if (currentCount >= teamMemberLimit) {
      throw new AppError(
        `Team member limit reached (${teamMemberLimit}). Please upgrade your plan to add more members.`,
        403,
        "MEMBER_LIMIT_REACHED",
      );
    }

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

  invite = asyncHandler(async (req, res) => {
    const { teamId, email, emails } = req.body;
    const appContext = req.user.currentVersion || "free";
    // Support single email or comma-separated list
    const emailList = emails
      ? emails
      : email.includes(",")
        ? email.split(",").map((e) => e.trim())
        : [email];
    const results = await teamService.createInvite(
      teamId,
      req.user.id,
      emailList,
      appContext,
    );
    res
      .status(201)
      .json({
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

  listPendingInvites = asyncHandler(async (req, res) => {
    const { teamId } = req.query;
    if (!teamId) throw new AppError("teamId required", 400, "BAD_REQUEST");
    const invites = await teamService.listPendingInvites(teamId, req.user.id);
    res.json({ success: true, data: invites });
  });
}

module.exports = new TeamController();
