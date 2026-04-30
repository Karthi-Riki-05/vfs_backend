const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const aiCreditService = require("../services/aiCredit.service");
const aiDetectService = require("../services/aiDetect.service");
const { getStripe } = require("../lib/stripe");
const { prisma } = require("../lib/prisma");

const ADDON_PACK_MAP = {
  starter: {
    priceIdEnv: "STRIPE_AI_ADDON_STARTER_PRICE",
    credits: 25,
    label: "AI Addon - Starter (25 credits)",
  },
  standard: {
    priceIdEnv: "STRIPE_AI_ADDON_STANDARD_PRICE",
    credits: 60,
    label: "AI Addon - Standard (60 credits)",
  },
  proppack: {
    priceIdEnv: "STRIPE_AI_ADDON_PROPPACK_PRICE",
    credits: 150,
    label: "AI Addon - Pro Pack (150 credits)",
  },
};

class AiCreditController {
  getBalance = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appContext = req.user.currentVersion || "free";
    const teamId = req.query?.teamId || req.headers["x-team-context"] || null;
    const balance = await aiCreditService.getBalance(
      userId,
      appContext,
      teamId,
    );
    res.json({ success: true, data: balance });
  });

  detectIntent = asyncHandler(async (req, res) => {
    const { message } = req.body || {};
    if (!message || typeof message !== "string" || !message.trim()) {
      throw new AppError("Message is required", 400, "VALIDATION_ERROR");
    }

    const userId = req.user.id;
    const appContext = req.user.currentVersion || "free";
    const teamId = req.query?.teamId || req.headers["x-team-context"] || null;
    const [isDiagram, balance] = await Promise.all([
      aiDetectService.isDiagramRequest(message),
      aiCreditService.getBalance(userId, appContext, teamId),
    ]);

    res.json({
      success: true,
      data: {
        isDiagramRequest: isDiagram,
        creditsRequired: isDiagram ? 1 : 0,
        balance,
      },
    });
  });

  generateDiagram = asyncHandler(async (req, res) => {
    const { message, confirmed, conversationId, messageId } = req.body || {};
    const userId = req.user.id;
    const appContext = req.user.currentVersion || "free";
    const teamId = req.query?.teamId || req.headers["x-team-context"] || null;

    if (!message || typeof message !== "string" || !message.trim()) {
      throw new AppError("Message is required", 400, "VALIDATION_ERROR");
    }
    if (!confirmed) {
      throw new AppError(
        "User confirmation required before generating diagram",
        400,
        "CONFIRMATION_REQUIRED",
      );
    }

    if (!(await aiCreditService.hasCredits(userId, appContext, teamId))) {
      const balance = await aiCreditService.getBalance(
        userId,
        appContext,
        teamId,
      );
      return res.status(402).json({
        success: false,
        error: {
          code: "INSUFFICIENT_CREDITS",
          message: "You have used all your diagram credits for this month.",
          balance,
          resetAt: balance.planResetsAt,
        },
      });
    }

    const { xml, model } = await aiDetectService.generateDiagramXml(
      message,
      appContext,
    );
    const result = await aiCreditService.deductCredit(
      userId,
      "diagram_generation",
      model,
      appContext,
      teamId,
    );

    // Persist to conversation
    let convId = conversationId || null;
    try {
      if (convId) {
        const owned = await prisma.aiConversation.findFirst({
          where: { id: convId, userId },
          select: { id: true },
        });
        if (!owned) convId = null;
      }

      if (!convId) {
        const title =
          message.length > 50 ? message.substring(0, 50) + "..." : message;
        const conv = await prisma.aiConversation.create({
          data: { userId, title, appContext },
        });
        convId = conv.id;
      }

      if (messageId) {
        // Update the existing message (usually a suggestion) to show the result
        await prisma.aiMessage.update({
          where: { id: messageId },
          data: {
            content: "Diagram generated. Preview below — click Insert to add to canvas.",
            diagramXml: xml,
            metadata: { intent: "generate_diagram", model, wasUpdated: true },
          },
        });
      } else {
        // Create new message pair
        await prisma.aiMessage.create({
          data: { conversationId: convId, role: "user", content: message },
        });
        await prisma.aiMessage.create({
          data: {
            conversationId: convId,
            role: "assistant",
            content: "Here is your diagram.",
            diagramXml: xml,
            metadata: { intent: "generate_diagram", model },
          },
        });
      }

      await prisma.aiConversation.update({
        where: { id: convId },
        data: { updatedAt: new Date() },
      });
    } catch (err) {
      console.error("[aiCredit] conversation persist error:", err.message);
    }

    res.json({
      success: true,
      data: {
        xml,
        model,
        conversationId: convId,
        creditsUsed: 1,
        remainingCredits: result.remaining,
        balance: result.balance,
      },
    });
  });

  generateFromDoc = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appContext = req.user.currentVersion || "free";
    const teamId = req.query?.teamId || req.headers["x-team-context"] || null;
    const confirmed =
      req.body?.confirmed === true ||
      req.body?.confirmed === "true" ||
      req.body?.confirmed === "1";

    if (!req.file) {
      throw new AppError("No file uploaded", 400, "VALIDATION_ERROR");
    }
    if (!req.file.size || req.file.size <= 0) {
      throw new AppError("Empty file uploaded", 400, "EMPTY_FILE");
    }
    if (!confirmed) {
      throw new AppError(
        "User confirmation required before generating diagram",
        400,
        "CONFIRMATION_REQUIRED",
      );
    }

    if (!(await aiCreditService.hasCredits(userId, appContext, teamId))) {
      const balance = await aiCreditService.getBalance(
        userId,
        appContext,
        teamId,
      );
      return res.status(402).json({
        success: false,
        error: {
          code: "INSUFFICIENT_CREDITS",
          message: "You have used all your diagram credits for this month.",
          balance,
        },
      });
    }

    const mime = req.file.mimetype;
    let extractedText = "";
    if (mime === "application/pdf") {
      const pdfParse = require("pdf-parse");
      const parsed = await pdfParse(req.file.buffer);
      extractedText = parsed.text;
    } else if (
      mime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mime === "application/msword"
    ) {
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      extractedText = result.value;
    } else {
      throw new AppError(
        "Only PDF and Word files are supported",
        400,
        "UNSUPPORTED_FILE_TYPE",
      );
    }

    if (!extractedText || extractedText.trim().length < 20) {
      throw new AppError(
        "Could not extract meaningful text from document",
        400,
        "EMPTY_DOCUMENT",
      );
    }

    const prompt = `Create a VSM diagram from this document:\n\n${extractedText.substring(0, 3000)}`;
    const { xml, model } = await aiDetectService.generateDiagramXml(
      prompt,
      appContext,
    );
    const result = await aiCreditService.deductCredit(
      userId,
      "doc_to_vsm",
      model,
      appContext,
      teamId,
    );

    res.json({
      success: true,
      data: {
        xml,
        model,
        creditsUsed: 1,
        remainingCredits: result.remaining,
        balance: result.balance,
      },
    });
  });

  handleAddonPurchase = asyncHandler(async (req, res) => {
    const { credits } = req.body || {};
    const userId = req.user.id;
    const appContext = req.user.currentVersion || "free";
    const teamId = req.query?.teamId || req.headers["x-team-context"] || null;
    const amount = parseInt(credits, 10);

    if (!amount || amount <= 0) {
      throw new AppError("Invalid credits amount", 400, "VALIDATION_ERROR");
    }

    await aiCreditService.addAddonCredits(userId, amount, appContext, teamId);
    const balance = await aiCreditService.getBalance(
      userId,
      appContext,
      teamId,
    );

    res.json({
      success: true,
      data: {
        message: `${amount} credits added successfully`,
        balance,
      },
    });
  });

  createAddonCheckout = asyncHandler(async (req, res) => {
    const { packType } = req.body || {};
    const userId = req.user.id;

    const pack = ADDON_PACK_MAP[packType];
    if (!pack) {
      throw new AppError(
        'Invalid pack type. Use "starter", "standard", or "proppack".',
        400,
        "VALIDATION_ERROR",
      );
    }

    const priceId = process.env[pack.priceIdEnv];
    if (!priceId || priceId === "placeholder") {
      throw new AppError(
        `Stripe price not configured for ${packType}. Run setup-stripe-products-inr.js and populate ${pack.priceIdEnv}.`,
        503,
        "PRICE_NOT_CONFIGURED",
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, stripeCustomerId: true },
    });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");

    const stripe = getStripe();
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      });
    }

    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        userId,
        purchaseType: "ai_addon_credits",
        credits: String(pack.credits),
        packType,
      },
      // Stripe Adaptive Pricing (account-level setting) converts to local currency
      success_url: `${baseUrl}/dashboard?addon_success=true&credits=${pack.credits}`,
      cancel_url: `${baseUrl}/dashboard?addon_cancelled=true`,
    });

    res.json({
      success: true,
      data: {
        checkoutUrl: session.url,
        sessionId: session.id,
        pack: {
          packType,
          credits: pack.credits,
          label: pack.label,
        },
      },
    });
  });
}

module.exports = new AiCreditController();
