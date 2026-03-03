const teamService = require('../services/team.service');
const asyncHandler = require('../utils/asyncHandler');

class TeamController {
    getTeams = asyncHandler(async (req, res) => {
        const result = await teamService.getTeams(req.user.id, req.query);
        res.json({ success: true, data: result });
    });

    getTeamById = asyncHandler(async (req, res) => {
        const team = await teamService.getTeamById(req.params.id, req.user.id);
        res.json({ success: true, data: team });
    });

    createTeam = asyncHandler(async (req, res) => {
        const team = await teamService.createTeam(req.user.id, req.body);
        res.status(201).json({ success: true, data: team });
    });

    updateTeam = asyncHandler(async (req, res) => {
        const team = await teamService.updateTeam(req.params.id, req.user.id, req.body);
        res.json({ success: true, data: team });
    });

    deleteTeam = asyncHandler(async (req, res) => {
        await teamService.deleteTeam(req.params.id, req.user.id);
        res.json({ success: true, data: { message: 'Team deleted successfully' } });
    });

    getMembers = asyncHandler(async (req, res) => {
        const members = await teamService.getMembers(req.params.id, req.user.id);
        res.json({ success: true, data: members });
    });

    addMember = asyncHandler(async (req, res) => {
        const member = await teamService.addMember(req.params.id, req.user.id, req.body.email, req.body.appType);
        res.status(201).json({ success: true, data: member });
    });

    removeMember = asyncHandler(async (req, res) => {
        await teamService.removeMember(req.params.id, req.params.uid, req.user.id);
        res.json({ success: true, data: { message: 'Member removed successfully' } });
    });

    invite = asyncHandler(async (req, res) => {
        // In production: send invitation email with token
        const member = await teamService.addMember(req.body.teamId, req.user.id, req.body.email, req.body.appType);
        res.status(201).json({ success: true, data: { message: 'Invitation sent', member } });
    });
}

module.exports = new TeamController();
