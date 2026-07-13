const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const contactService = require("../services/contact.service");
const publicAssistantService = require("../services/publicAssistant.service");
const flowService = require("../services/flow.service");
const shapeService = require("../services/shape.service");
const { verifyRecaptcha } = require("../utils/recaptcha");

class PublicController {
  // Unauthenticated flow viewer — only reachable when the owner has
  // explicitly flagged the flow isPublic=true. Always view-only.
  getPublicFlow = asyncHandler(async (req, res) => {
    const flow = await flowService.getPublicFlow(req.params.id);
    if (!flow) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Flow not found" },
      });
    }
    res.json({ success: true, data: flow });
  });

  getPublicShape = asyncHandler(async (req, res) => {
    const shape = await shapeService.getPublicShape(req.params.id);
    if (!shape) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Shape not found" },
      });
    }
    res.json({ success: true, data: shape });
  });

  submitContact = asyncHandler(async (req, res) => {
    const ok = await verifyRecaptcha(req.body.captchaToken, req.ip);
    if (!ok) {
      throw new AppError(
        "Captcha verification failed. Please try again.",
        400,
        "CAPTCHA_FAILED",
      );
    }
    await contactService.submitContactForm({ ...req.body, ipAddress: req.ip });
    res.json({ success: true, data: { message: "Message sent" } });
  });

  assistantChat = asyncHandler(async (req, res) => {
    const { reply } = await publicAssistantService.chat({
      messages: req.body.messages,
    });
    res.json({ success: true, data: { reply } });
  });
}

module.exports = new PublicController();
