const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notification.controller");
const { authenticate } = require("../middleware/auth.middleware");

router.get("/", authenticate, notificationController.list);
router.get("/count", authenticate, notificationController.count);
router.put("/read-all", authenticate, notificationController.markAllRead);
router.put("/:id/read", authenticate, notificationController.markRead);

module.exports = router;
