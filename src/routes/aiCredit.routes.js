const express = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const { aiLimiter } = require("../middleware/rateLimiter");
const { docUpload } = require("../middleware/docUpload");
const aiCreditController = require("../controllers/aiCredit.controller");

const router = express.Router();

router.use(authenticate);

router.get("/credits", aiCreditController.getBalance);
router.post("/detect", aiCreditController.detectIntent);
router.post("/generate-diagram", aiLimiter, aiCreditController.generateDiagram);
router.post(
  "/generate-from-doc",
  aiLimiter,
  docUpload.single("document"),
  aiCreditController.generateFromDoc,
);
router.post("/addon/purchase", aiCreditController.handleAddonPurchase);
router.post("/addon/checkout", aiCreditController.createAddonCheckout);

module.exports = router;
