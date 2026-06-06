const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const aiCreditService = require("../services/aiCredit.service");
const aiDetectService = require("../services/aiDetect.service");
const { getStripe, getStripePrice, isLiveMode } = require("../lib/stripe");
const { prisma } = require("../lib/prisma");

// When the Team-app header is sent without a specific team selection, verify the
// user actually owns an active team subscription before billing the team pool.
// Without this guard, a free user in the Team app silently drains the
// auto-created 300-credit team bucket instead of their 20-credit personal pool.
async function resolveAppContextForBilling(
  userId,
  headerCtx,
  teamId,
  currentVersion,
) {
  if (headerCtx === "team" && !teamId) {
    const ownsTeamPlan = await prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ["active", "trialing"] },
        plan: { tier: { gte: 2 } },
      },
      select: { id: true },
    });
    if (!ownsTeamPlan) return currentVersion || "free";
  }
  return headerCtx || currentVersion || "free";
}

const ADDON_PACK_MAP = {
  starter: {
    testPriceEnv: "STRIPE_TEST_AI_ADDON_STARTER_PRICE",
    livePriceEnv: "STRIPE_LIVE_AI_ADDON_STARTER_PRICE",
    legacyPriceEnv: "STRIPE_AI_ADDON_STARTER_PRICE",
    credits: 25,
    label: "AI Addon - Starter (25 credits)",
  },
  standard: {
    testPriceEnv: "STRIPE_TEST_AI_ADDON_STANDARD_PRICE",
    livePriceEnv: "STRIPE_LIVE_AI_ADDON_STANDARD_PRICE",
    legacyPriceEnv: "STRIPE_AI_ADDON_STANDARD_PRICE",
    credits: 60,
    label: "AI Addon - Standard (60 credits)",
  },
  proppack: {
    testPriceEnv: "STRIPE_TEST_AI_ADDON_PROPPACK_PRICE",
    livePriceEnv: "STRIPE_LIVE_AI_ADDON_PROPPACK_PRICE",
    legacyPriceEnv: "STRIPE_AI_ADDON_PROPPACK_PRICE",
    credits: 150,
    label: "AI Addon - Pro Pack (150 credits)",
  },
};

class AiCreditController {
  getBalance = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    // Allow callers to read a specific workspace's balance via query
    // (used by tests / admin tools). Otherwise resolve from the header,
    // guarding against free users claiming the team pool.
    const teamId = req.query?.teamId || req.headers["x-team-context"] || null;
    const appContext = req.query?.appContext
      ? req.query.appContext
      : await resolveAppContextForBilling(
          userId,
          req.headers["x-app-context"],
          teamId,
          req.user.currentVersion,
        );
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
    const teamId = req.query?.teamId || req.headers["x-team-context"] || null;
    const appContext = await resolveAppContextForBilling(
      userId,
      req.headers["x-app-context"],
      teamId,
      req.user.currentVersion,
    );
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
    const teamId = req.query?.teamId || req.headers["x-team-context"] || null;
    const appContext = await resolveAppContextForBilling(
      userId,
      req.headers["x-app-context"],
      teamId,
      req.user.currentVersion,
    );

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
      req.user,
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
            content:
              "Diagram generated. Preview below — click Insert to add to canvas.",
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
    const teamId = req.query?.teamId || req.headers["x-team-context"] || null;
    const appContext = await resolveAppContextForBilling(
      userId,
      req.headers["x-app-context"],
      teamId,
      req.user.currentVersion,
    );
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
      req.user,
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
    const { credits, packType, source } = req.body || {};
    const userId = req.user.id;
    // Allow caller to override appContext (admin / test). Default to the
    // user's current workspace.
    const appContext =
      req.body?.appContext || req.user.currentVersion || "team";
    const teamId = req.query?.teamId || req.headers["x-team-context"] || null;
    const amount = parseInt(credits, 10);

    if (!amount || amount <= 0) {
      throw new AppError("Invalid credits amount", 400, "VALIDATION_ERROR");
    }

    // Grant credits + write audit + history rows in one transaction so a
    // partial failure can't leave the records out of sync (matches what
    // the Stripe webhook does for a real purchase).
    await aiCreditService.addAddonCredits(userId, amount, appContext, teamId);

    const txnId = `manual_${userId}_${Date.now()}`;
    const planLabel = `AI Credits Addon${packType ? ` — ${packType}` : ""} (${amount} credits)`;
    await prisma.$transaction([
      prisma.transactionLog.create({
        data: {
          userId,
          chargeId: txnId,
          txnId,
          amountCharged: 0,
          currency: "usd",
          status: "success",
          paymentMethod: source === "admin" ? "admin" : "manual",
          purchaseType: "ai_addon_credits",
          appType: appContext === "team" ? "enterprise" : "individual",
          appContext,
        },
      }),
      prisma.subscriptionHistory.create({
        data: {
          userId,
          planName: planLabel,
          productType: "ai_addon_credits",
          status: "completed",
          price: 0,
          currency: "usd",
          isRecurring: false,
          source: source || "manual",
          startedAt: new Date(),
          archivedReason: "manual_grant",
          appContext,
          snapshot: { credits: amount, packType: packType || null, appContext },
        },
      }),
    ]);

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
    const appContext =
      req.headers["x-app-context"] || req.user.currentVersion || "team";
    const teamId = req.query?.teamId || req.headers["x-team-context"] || null;

    const pack = ADDON_PACK_MAP[packType];
    if (!pack) {
      throw new AppError(
        'Invalid pack type. Use "starter", "standard", or "proppack".',
        400,
        "VALIDATION_ERROR",
      );
    }

    const priceId = getStripePrice(
      pack.testPriceEnv,
      pack.livePriceEnv,
      pack.legacyPriceEnv,
    );
    if (!priceId) {
      const modeVar = isLiveMode() ? pack.livePriceEnv : pack.testPriceEnv;
      throw new AppError(
        `Stripe price not configured for ${packType}. Set ${modeVar} or ${pack.legacyPriceEnv} in your .env file.`,
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
        appContext,
        ...(teamId ? { teamId } : {}),
      },
      // Stripe Adaptive Pricing (account-level setting) converts to local currency
      success_url: `${baseUrl}/dashboard/subscription?addon_success=true&credits=${pack.credits}`,
      cancel_url: `${baseUrl}/dashboard/subscription?addon_cancelled=true`,
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
