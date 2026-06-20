const express = require("express");
const router = express.Router();
const controller = require("../controllers/entitlements.controller");
const { authenticate } = require("../middleware/auth.middleware");

// Protected — entitlements are per authenticated user.
router.use(authenticate);

router.get("/", controller.getMine);

module.exports = router;
