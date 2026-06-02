const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboard.controller");
const { authenticate } = require("../middleware/auth.middleware");

// All dashboard routes are protected
router.use(authenticate);

// Root handler — returns index of available sub-routes
router.get("/", (req, res) => {
  res.json({
    success: true,
    data: {
      message: "Dashboard API",
      availableRoutes: [
        "GET /api/v1/dashboard/stats",
        "GET /api/v1/dashboard/activity",
        "GET /api/v1/dashboard/recent-flows",
        "GET /api/v1/dashboard/team-activity",
      ],
    },
  });
});

router.get("/stats", dashboardController.getStats);
router.get("/activity", dashboardController.getActivity);
router.get("/recent-flows", dashboardController.getRecentFlows);
router.get("/team-activity", dashboardController.getTeamActivity);

module.exports = router;
