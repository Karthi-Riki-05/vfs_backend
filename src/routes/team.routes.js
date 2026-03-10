const express = require('express');
const router = express.Router();
const teamController = require('../controllers/team.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { checkTeamAccess } = require('../middleware/checkTeamAccess');
const validate = require('../middleware/validate');
const { createTeamSchema, updateTeamSchema, addMemberSchema, removeMemberSchema, inviteSchema, idParamSchema, getTeamsQuerySchema } = require('../validators/team.validator');

router.use(authenticate);

/**
 * @swagger
 * /api/v1/teams:
 *   get:
 *     summary: List user's teams
 *     tags: [Teams]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of teams
 */
router.get('/', validate(getTeamsQuerySchema), teamController.getTeams);

/**
 * @swagger
 * /api/v1/teams:
 *   post:
 *     summary: Create a new team
 *     tags: [Teams]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               appType:
 *                 type: string
 *                 enum: [enterprise, individual]
 *     responses:
 *       201:
 *         description: Team created
 */
router.post('/', checkTeamAccess, validate(createTeamSchema), teamController.createTeam);

/**
 * @swagger
 * /api/v1/teams/invite:
 *   post:
 *     summary: Send team invitation email
 *     tags: [Teams]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [teamId, email]
 *             properties:
 *               teamId:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       201:
 *         description: Invitation sent
 */
router.post('/invite', checkTeamAccess, validate(inviteSchema), teamController.invite);
router.get('/invites', teamController.listPendingInvites);
router.get('/accept', teamController.acceptInvite);

/**
 * @swagger
 * /api/v1/teams/{id}:
 *   get:
 *     summary: Get team by ID with members
 *     tags: [Teams]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Team details with members
 *       404:
 *         description: Team not found
 */
router.get('/:id', validate(idParamSchema), teamController.getTeamById);

/**
 * @swagger
 * /api/v1/teams/{id}:
 *   put:
 *     summary: Update team (owner only)
 *     tags: [Teams]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Team updated
 */
router.put('/:id', validate(updateTeamSchema), teamController.updateTeam);

/**
 * @swagger
 * /api/v1/teams/{id}:
 *   delete:
 *     summary: Delete team (owner only)
 *     tags: [Teams]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Team deleted
 */
router.delete('/:id', validate(idParamSchema), teamController.deleteTeam);

/**
 * @swagger
 * /api/v1/teams/{id}/members:
 *   get:
 *     summary: List team members
 *     tags: [Teams]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of team members
 */
router.get('/:id/members', validate(idParamSchema), teamController.getMembers);

/**
 * @swagger
 * /api/v1/teams/{id}/members:
 *   post:
 *     summary: Add member to team
 *     tags: [Teams]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       201:
 *         description: Member added
 *       400:
 *         description: Member limit reached
 *       409:
 *         description: Already a member
 */
router.post('/:id/members', checkTeamAccess, validate(addMemberSchema), teamController.addMember);

/**
 * @swagger
 * /api/v1/teams/{id}/members/{uid}:
 *   delete:
 *     summary: Remove member from team
 *     tags: [Teams]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: uid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member removed
 */
router.delete('/:id/members/:uid', validate(removeMemberSchema), teamController.removeMember);

module.exports = router;
