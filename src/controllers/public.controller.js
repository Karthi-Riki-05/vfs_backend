const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const contactService = require("../services/contact.service");
const publicAssistantService = require("../services/publicAssistant.service");
const { verifyRecaptcha } = require("../utils/recaptcha");

class PublicController {
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
