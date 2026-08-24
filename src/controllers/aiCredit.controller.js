const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const aiCreditService = require("../services/aiCredit.service");
const aiDetectService = require("../services/aiDetect.service");
const { getStripe, getStripePrice, isLiveMode } = require("../lib/stripe");
const { prisma } = require("../lib/prisma");
const { workspaceHeader, workspaceQuery } = require("../lib/workspaceContext");

// When the Team-app header is sent without a specific team selection, verify the
// user actually owns an active team subscription before billing the team pool.
// Without this guard, a free user in the Team app silently drains the
// auto-created 300-credit team bucket instead of their 20-credit personal pool.
async function resolveAppContextForBilling(
  userId,
  headerCtx,
  workspaceId,
  currentVersion,
) {
  if (headerCtx === "team" && !workspaceId) {
    const ownsTeamPlan = await prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ["active", "trialing", "cancelling"] },
        plan: { tier: { gte: 2 } },
      },
      select: { id: true },
    });
    // FREE, not `currentVersion`. currentVersion holds the user's strongest
    // plan across BOTH apps, so a Pro user opening the Team app resolved to
    // "pro" — the Team dashboard showed their 50 Pro credits, and worse, a
    // team-app AI action DEDUCTED from the Pro pool. The apps bill separately;
    // no team plan in the team app means the free pool.
    if (!ownsTeamPlan) return "free";
  }
  return headerCtx || currentVersion || "free";
}

// Persist a generated diagram into the Ai conversation/message history.
// Shared by the synchronous generateDiagram path and the async job processor
// so both store identical history. messageId is only updated when it refers to
// a REAL persisted AiMessage (the chat suggestion is a client-only `local-…`
// id that does not exist in the DB); otherwise a fresh message pair is created.
async function persistDiagramToConversation({
  userId,
  message,
  xml,
  model,
  appContext,
  conversationId,
  messageId,
}) {
  let convId = conversationId || null;
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

  let updated = false;
  if (messageId) {
    const existing = await prisma.aiMessage.findFirst({
      where: { id: messageId, conversationId: convId },
      select: { id: true },
    });
    if (existing) {
      await prisma.aiMessage.update({
        where: { id: messageId },
        data: {
          content:
            "Diagram generated. Preview below — click Insert to add to canvas.",
          diagramXml: xml,
          metadata: { intent: "generate_diagram", model, wasUpdated: true },
        },
      });
      updated = true;
    }
  }
  if (!updated) {
    await prisma.aiMessage.create({
      data: { conversationId: convId, role: "user", content: message },
    });
    await prisma.aiMessage.create({
      data: {
        conversationId: convId,
        role: "assistant",
        content:
          "Diagram generated. Preview below — click Insert to add to canvas.",
        diagramXml: xml,
        metadata: { intent: "generate_diagram", model },
      },
    });
  }

  await prisma.aiConversation.update({
    where: { id: convId },
    data: { updatedAt: new Date() },
  });
  return convId;
}

// Build a compact context string from the recent messages of a conversation
// so diagram classification + generation are conversation-aware (like a normal
// chat). Caps at the last `limit` messages, trims each, and never includes the
// stored diagram XML (only role + text). Returns "" for a new/empty/unknown
// conversation. Never throws — context is best-effort.
// App-scaffolding assistant lines that carry no conversation *content* — they
// are the diagram/credit UX chatter we persist. Including them in context made
// "analyse our history and make a flow" diagram the app's own plumbing (Start →
// "why so generate?" → "need explicit diagram request" → …) instead of the real
// topic. Filter them so the model sees only substantive discussion.
const SCAFFOLDING_RE =
  /^(Diagram generated\. Preview|Diagram updated\.|I'll create a diagram|I'll update the diagram|⚡|Want me to generate a diagram|You've used all your diagram credits|Analyzed document\.|Could not analyze|Ready to generate)/i;

function isScaffolding(content) {
  const t = String(content || "").trim();
  if (!t) return true;
  return SCAFFOLDING_RE.test(t);
}

// When the user explicitly asks to summarise/diagram the WHOLE conversation we
// need a much wider window than the default, or the topic gets truncated.
const FULL_HISTORY_RE =
  /\b(history|whole (chat|conversation|thing)|entire (chat|conversation)|our (chat|conversation|discussion)|everything (we|you) (discussed|talked)|summar(y|ise|ize)|so far|above|main (concept|topic|idea|point))\b/i;

function wantsFullHistory(text) {
  return FULL_HISTORY_RE.test(String(text || ""));
}

async function buildConversationContext(conversationId, userId, limit = 20) {
  if (!conversationId) return "";
  try {
    const conv = await prisma.aiConversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (!conv) return "";
    // Over-fetch, then drop scaffolding, then keep the last `limit` substantive
    // messages — so filtered-out plumbing lines don't eat the window.
    const msgs = await prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: Math.max(limit * 3, 40),
      select: { role: true, content: true },
    });
    if (!msgs || !msgs.length) return "";
    const substantive = msgs
      .reverse()
      .filter((m) => !isScaffolding(m.content));
    const kept = substantive.slice(-limit);
    if (!kept.length) return "";
    return kept
      .map(
        (m) =>
          `${m.role === "user" ? "User" : "Assistant"}: ${String(
            m.content || "",
          ).slice(0, 500)}`,
      )
      .join("\n");
  } catch (_) {
    return "";
  }
}

// Background processor for async diagram jobs. Runs AFTER the HTTP response is
// sent (not awaited by the request), so it is immune to the reverse-proxy
// gateway timeout that caused the 504. Generates the XML, deducts the credit on
// success, persists to history, and writes the result back onto the AiJob row
// for the client to poll. Never throws — all failures land on the job row.
async function processDiagramJob(jobId) {
  try {
    const job = await prisma.aiJob.update({
      where: { id: jobId },
      data: { status: "processing" },
    });

    // Conversation-aware: pull recent chat so "this business" etc. resolve.
    // When the user asked to diagram the WHOLE history ("analyse our history and
    // make a flow"), widen the window so the real topic isn't truncated to just
    // the last few (often meta) turns.
    const context = await buildConversationContext(
      job.conversationId,
      job.userId,
      wantsFullHistory(job.prompt) ? 40 : 20,
    );

    // Classify complexity so the async path routes by it (Step 6) and charges
    // by token usage (Step 7) — same as the sync path. Context makes the
    // complexity reflect the whole discussion, not just the one-line request.
    let complexity = null;
    if (typeof aiDetectService.classifyComplexity === "function") {
      try {
        complexity = await aiDetectService.classifyComplexity(
          job.prompt,
          context,
        );
      } catch (_) {
        complexity = null;
      }
    }

    // generateDiagramXml accepts a userId string and resolves the plan/model.
    // job.existingXml (when the user asked to edit the current diagram) makes
    // the generator modify it in place instead of regenerating from scratch.
    const { xml, model, usage } = await aiDetectService.generateDiagramXml(
      job.prompt,
      job.userId,
      complexity,
      context,
      job.existingXml || "",
    );

    const estimate =
      complexity && typeof aiDetectService.estimateCredits === "function"
        ? aiDetectService.estimateCredits(complexity)
        : null;
    const deduct = await aiCreditService.deductCredit(
      job.userId,
      "diagram_generation",
      model,
      job.appContext || "free",
      job.workspaceId || null,
      {
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        capMin: estimate?.min,
        capMax: estimate?.max,
      },
    );

    let convId = job.conversationId || null;
    try {
      convId = await persistDiagramToConversation({
        userId: job.userId,
        message: job.prompt,
        xml,
        model,
        appContext: job.appContext || "free",
        conversationId: job.conversationId,
        messageId: job.messageId,
      });
    } catch (persistErr) {
      console.error(
        "[aiCredit] job conversation persist error:",
        persistErr.message,
      );
    }

    await prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: "done",
        result: xml,
        model,
        conversationId: convId,
        remainingCredits: deduct.remaining,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    await prisma.aiJob
      .update({
        where: { id: jobId },
        data: {
          status: "error",
          error: err.message || "Diagram generation failed",
          completedAt: new Date(),
        },
      })
      .catch(() => {});
  }
}

const ADDON_PACK_MAP = {
  starter: {
    testPriceEnv: "STRIPE_TEST_AI_ADDON_STARTER_PRICE",
    livePriceEnv: "STRIPE_LIVE_AI_ADDON_STARTER_PRICE",
    legacyPriceEnv: "STRIPE_AI_ADDON_STARTER_PRICE",
    credits: 50,
    label: "AI Addon - Starter (50 credits)",
  },
  standard: {
    testPriceEnv: "STRIPE_TEST_AI_ADDON_STANDARD_PRICE",
    livePriceEnv: "STRIPE_LIVE_AI_ADDON_STANDARD_PRICE",
    legacyPriceEnv: "STRIPE_AI_ADDON_STANDARD_PRICE",
    credits: 100,
    label: "AI Addon - Standard (100 credits)",
  },
  proppack: {
    testPriceEnv: "STRIPE_TEST_AI_ADDON_PROPPACK_PRICE",
    livePriceEnv: "STRIPE_LIVE_AI_ADDON_PROPPACK_PRICE",
    legacyPriceEnv: "STRIPE_AI_ADDON_PROPPACK_PRICE",
    credits: 200,
    label: "AI Addon - Pro Pack (200 credits)",
  },
};

class AiCreditController {
  getBalance = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    // Allow callers to read a specific workspace's balance via query
    // (used by tests / admin tools). Otherwise resolve from the header,
    // guarding against free users claiming the team pool.
    const workspaceId = workspaceQuery(req) || workspaceHeader(req) || null;
    const appContext = req.query?.appContext
      ? req.query.appContext
      : await resolveAppContextForBilling(
          userId,
          req.headers["x-app-context"],
          workspaceId,
          req.user.currentVersion,
        );
    const balance = await aiCreditService.getBalance(
      userId,
      appContext,
      workspaceId,
    );
    res.json({ success: true, data: balance });
  });

  detectIntent = asyncHandler(async (req, res) => {
    const { message, conversationId } = req.body || {};
    if (!message || typeof message !== "string" || !message.trim()) {
      throw new AppError("Message is required", 400, "VALIDATION_ERROR");
    }

    const userId = req.user.id;
    const workspaceId = workspaceQuery(req) || workspaceHeader(req) || null;
    const appContext = await resolveAppContextForBilling(
      userId,
      req.headers["x-app-context"],
      workspaceId,
      req.user.currentVersion,
    );
    const [isDiagram, balance] = await Promise.all([
      aiDetectService.isDiagramRequest(message),
      aiCreditService.getBalance(userId, appContext, workspaceId),
    ]);

    // Step 3 — classify complexity so the UI can (Step 4) show a credit
    // estimate before generating. Defensive: never let a classifier failure
    // break intent detection.
    let complexity = null;
    let creditEstimate = null;
    if (isDiagram && typeof aiDetectService.classifyComplexity === "function") {
      try {
        // Conversation-aware estimate: fold in recent chat so the shown range
        // reflects the whole discussion, not just this one line.
        const context = await buildConversationContext(conversationId, userId);
        complexity = await aiDetectService.classifyComplexity(message, context);
        creditEstimate = aiDetectService.estimateCredits(complexity);
      } catch (_) {
        complexity = null;
        creditEstimate = null;
      }
    }

    res.json({
      success: true,
      data: {
        isDiagramRequest: isDiagram,
        complexity,
        // Estimated range shown to the user before generating (Step 4).
        // NOTE: the actual charge is still a flat 1 credit until token-based
        // deduction lands (Step 7) — keep creditsRequired truthful for the
        // balance gate until then.
        creditEstimate,
        creditsRequired: isDiagram ? 1 : 0,
        balance,
      },
    });
  });

  generateDiagram = asyncHandler(async (req, res) => {
    const { message, confirmed, conversationId, messageId, existingXml } =
      req.body || {};
    const userId = req.user.id;
    const workspaceId = workspaceQuery(req) || workspaceHeader(req) || null;
    const appContext = await resolveAppContextForBilling(
      userId,
      req.headers["x-app-context"],
      workspaceId,
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

    if (!(await aiCreditService.hasCredits(userId, appContext, workspaceId))) {
      const balance = await aiCreditService.getBalance(
        userId,
        appContext,
        workspaceId,
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

    // Step 6 — classify complexity here so generation can route by it
    // (SIMPLE → Gemini for all; MEDIUM/COMPLEX → Claude for paid tiers).
    // Defensive: a classifier failure just leaves routing on its tier-only
    // fallback inside generateDiagramXml.
    // Conversation-aware: recent chat lets the diagram resolve references and
    // rate complexity from the whole discussion (like Claude/Gemini chat).
    const context = await buildConversationContext(
      conversationId,
      userId,
      wantsFullHistory(message) ? 40 : 20,
    );
    let complexity = null;
    if (typeof aiDetectService.classifyComplexity === "function") {
      try {
        complexity = await aiDetectService.classifyComplexity(message, context);
      } catch (_) {
        complexity = null;
      }
    }

    const { xml, model, usage } = await aiDetectService.generateDiagramXml(
      message,
      req.user,
      complexity,
      context,
      typeof existingXml === "string" && existingXml.trim() ? existingXml : "",
    );
    // Step 7 — charge by actual token usage, clamped to the estimate range.
    const estimate =
      complexity && typeof aiDetectService.estimateCredits === "function"
        ? aiDetectService.estimateCredits(complexity)
        : null;
    const result = await aiCreditService.deductCredit(
      userId,
      "diagram_generation",
      model,
      appContext,
      workspaceId,
      {
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        capMin: estimate?.min,
        capMax: estimate?.max,
      },
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

      // messageId is only updatable when it refers to a REAL persisted
      // AiMessage. The chat flow creates the "click Generate" suggestion as a
      // client-only message (id like `local-...`), so that id will not exist in
      // the DB. Previously prisma.aiMessage.update threw P2025 here, the catch
      // below swallowed it, and the diagram was NEVER persisted — so it showed
      // in the live session but vanished on reload. Verify existence first and
      // fall back to creating a real message pair otherwise.
      let updated = false;
      if (messageId) {
        const existing = await prisma.aiMessage.findFirst({
          where: { id: messageId, conversationId: convId },
          select: { id: true },
        });
        if (existing) {
          await prisma.aiMessage.update({
            where: { id: messageId },
            data: {
              content:
                "Diagram generated. Preview below — click Insert to add to canvas.",
              diagramXml: xml,
              metadata: { intent: "generate_diagram", model, wasUpdated: true },
            },
          });
          updated = true;
        }
      }
      if (!updated) {
        // Create a new persisted message pair (covers the chat→suggestion flow
        // where messageId is a client-local id, and the no-messageId case).
        await prisma.aiMessage.create({
          data: { conversationId: convId, role: "user", content: message },
        });
        await prisma.aiMessage.create({
          data: {
            conversationId: convId,
            role: "assistant",
            content:
              "Diagram generated. Preview below — click Insert to add to canvas.",
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
        creditsUsed: result.creditsUsed ?? 1,
        remainingCredits: result.remaining,
        balance: result.balance,
      },
    });
  });

  // ── Async (background-job) diagram generation ──
  // Returns a jobId immediately so the request never sits open long enough for
  // a reverse-proxy gateway timeout (the 504). The client polls getDiagramJob.
  startDiagramJob = asyncHandler(async (req, res) => {
    const { message, confirmed, conversationId, messageId, existingXml } =
      req.body || {};
    const userId = req.user.id;
    const workspaceId = workspaceQuery(req) || workspaceHeader(req) || null;
    const appContext = await resolveAppContextForBilling(
      userId,
      req.headers["x-app-context"],
      workspaceId,
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

    // Pre-check credits so the user gets an immediate 402 instead of starting a
    // job that fails. The credit is actually deducted in the background only on
    // successful generation (mirrors the synchronous path).
    if (!(await aiCreditService.hasCredits(userId, appContext, workspaceId))) {
      const balance = await aiCreditService.getBalance(
        userId,
        appContext,
        workspaceId,
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

    const job = await prisma.aiJob.create({
      data: {
        userId,
        status: "pending",
        prompt: message,
        conversationId: conversationId || null,
        messageId: messageId || null,
        appContext,
        workspaceId: workspaceId || null,
        existingXml:
          typeof existingXml === "string" && existingXml.trim()
            ? existingXml
            : null,
      },
    });

    // Fire-and-forget — do NOT await. Runs after the response is sent.
    processDiagramJob(job.id);

    res.status(202).json({
      success: true,
      data: { jobId: job.id, status: "pending" },
    });
  });

  getDiagramJob = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const job = await prisma.aiJob.findFirst({
      where: { id: req.params.jobId, userId },
    });
    if (!job) {
      throw new AppError("Job not found", 404, "JOB_NOT_FOUND");
    }
    res.json({
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        xml: job.status === "done" ? job.result : null,
        model: job.model || null,
        conversationId: job.conversationId || null,
        remainingCredits: job.remainingCredits ?? null,
        error: job.status === "error" ? job.error : null,
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
    const workspaceId = workspaceQuery(req) || workspaceHeader(req) || null;
    const amount = parseInt(credits, 10);

    if (!amount || amount <= 0) {
      throw new AppError("Invalid credits amount", 400, "VALIDATION_ERROR");
    }

    // Grant credits + write audit + history rows in one transaction so a
    // partial failure can't leave the records out of sync (matches what
    // the Stripe webhook does for a real purchase).
    await aiCreditService.addAddonCredits(userId, amount, appContext, workspaceId);

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
      workspaceId,
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
    const workspaceId = workspaceQuery(req) || workspaceHeader(req) || null;

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
    const cancelPath = appContext === "pro" ? "/dashboard/pro" : "/dashboard";
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
        ...(workspaceId ? { workspaceId } : {}),
      },
      // BUG-PAY-002: save card for future charges after one-time payment
      payment_intent_data: { setup_future_usage: "off_session" },
      // session_id lets the success page call /ai/addon/verify as a fallback
      // when the webhook can't reach the backend (e.g. local dev).
      success_url: `${baseUrl}/payment-return.html?redirect=%2Fsubscription%2Fsuccess&type=ai_credits&credits=${pack.credits}&packType=${packType}&app_context=${appContext}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}${cancelPath}?addon_cancelled=true`,
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

  // Redirect-time fallback for the checkout.session.completed webhook —
  // grants the credits when the webhook can't reach the backend (local dev)
  // or hasn't arrived yet. Idempotent via transactionLog.txnId = session.id,
  // the same key the webhook writes, so double-grants are impossible.
  verifyAddonCheckout = asyncHandler(async (req, res) => {
    const sessionId = req.query?.session_id;
    const userId = req.user.id;
    if (!sessionId) {
      throw new AppError("session_id is required", 400, "VALIDATION_ERROR");
    }

    const stripe = getStripe();
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (err) {
      throw new AppError("Invalid checkout session", 400, "INVALID_SESSION");
    }

    const meta = session.metadata || {};
    if (meta.purchaseType !== "ai_addon_credits") {
      throw new AppError(
        "Not an AI credit purchase session",
        400,
        "INVALID_SESSION",
      );
    }
    if (meta.userId !== userId) {
      throw new AppError(
        "Session does not belong to this user",
        403,
        "FORBIDDEN",
      );
    }

    const appContext = meta.appContext || req.user.currentVersion || "free";
    const metaTeamId = meta.workspaceId || null;

    if (session.payment_status !== "paid") {
      return res.json({
        success: true,
        data: {
          granted: false,
          paymentStatus: session.payment_status,
          balance: await aiCreditService.getBalance(
            userId,
            appContext,
            metaTeamId,
          ),
        },
      });
    }

    const amount = parseInt(meta.credits, 10);
    if (!amount || amount <= 0) {
      throw new AppError(
        "Session has no credits metadata",
        400,
        "INVALID_SESSION",
      );
    }

    // Idempotency: the webhook may have already processed this session.
    const existingTxn = await prisma.transactionLog.findFirst({
      where: { txnId: session.id },
    });
    let granted = false;
    if (!existingTxn) {
      await aiCreditService.addAddonCredits(
        userId,
        amount,
        appContext,
        metaTeamId,
      );
      granted = true;

      const amountTotal = session.amount_total || 0;
      const currency = session.currency || "usd";
      const planLabel = `AI Credits Addon${meta.packType ? ` — ${meta.packType}` : ""} (${amount} credits)`;
      await prisma.$transaction([
        prisma.transactionLog.create({
          data: {
            userId,
            chargeId: session.payment_intent || session.id,
            txnId: session.id,
            amountCharged: amountTotal,
            currency,
            status: "success",
            paymentMethod: session.payment_method_types?.[0] || "card",
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
            price: amountTotal / 100,
            currency,
            isRecurring: false,
            source: "stripe",
            startedAt: new Date(),
            archivedReason: "one_time_purchase",
            stripePaymentId: session.payment_intent || session.id,
            appContext,
            snapshot: {
              sessionId: session.id,
              packType: meta.packType || null,
              credits: amount,
              appContext,
              verifiedVia: "redirect",
            },
          },
        }),
      ]);
    }

    const balance = await aiCreditService.getBalance(
      userId,
      appContext,
      metaTeamId,
    );
    res.json({
      success: true,
      data: {
        granted,
        alreadyProcessed: !!existingTxn,
        credits: amount,
        balance,
      },
    });
  });
}

module.exports = new AiCreditController();
// Shared billing-context resolver — also consumed by flow.controller's document
// generation path so both deduct against the same workspace pool (single source
// of truth; do NOT duplicate this logic — see DATA-LOSS-001).
module.exports.resolveAppContextForBilling = resolveAppContextForBilling;
