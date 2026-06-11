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
// Async background-job variant — returns a jobId immediately (no 504), client polls.
router.post(
  "/generate-diagram-job",
  aiLimiter,
  aiCreditController.startDiagramJob,
);
router.get("/generate-diagram-job/:jobId", aiCreditController.getDiagramJob);
router.post(
  "/generate-from-doc",
  aiLimiter,
  docUpload.single("document"),
  aiCreditController.generateFromDoc,
);
router.post("/addon/purchase", aiCreditController.handleAddonPurchase);
router.post("/addon/checkout", aiCreditController.createAddonCheckout);
router.get("/addon/verify", aiCreditController.verifyAddonCheckout);

module.exports = router;
