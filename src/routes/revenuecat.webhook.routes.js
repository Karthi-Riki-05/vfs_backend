const express = require("express");
const router = express.Router();
const c = require("../controllers/revenuecat.controller");

// Raw body needed so we can verify payload integrity and parse manually
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  c.handleWebhook,
);

module.exports = router;
