const express = require('express');
const router = express.Router();
const teamController = require('../controllers/team.controller');
const { authenticate } = require('../middleware/auth.middleware');

// PUBLIC — no auth required, anyone with token can verify
router.get('/verify', teamController.verifyInvite);

// AUTHENTICATED — must be logged in to accept
router.post('/accept', authenticate, teamController.acceptInvite);

module.exports = router;
