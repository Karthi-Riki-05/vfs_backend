const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth.middleware');

// All dashboard routes are protected
router.use(authenticate);

router.get('/stats', dashboardController.getStats);
router.get('/activity', dashboardController.getActivity);
router.get('/recent-flows', dashboardController.getRecentFlows);
router.get('/team-activity', dashboardController.getTeamActivity);

module.exports = router;
