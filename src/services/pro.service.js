const { prisma } = require("../lib/prisma");
const { getStripe, getStripeCurrency } = require("../lib/stripe");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

const FLOW_PRICING = {
  50: 500, // $5.00
  unlimited: 1000, // $10.00
};

class ProService {
  async getAppStatus(userId) {
    console.log("[ProService.getAppStatus] userId:", userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        hasPro: true,
        proPurchasedAt: true,
        proFlowLimit: true,
        proAdditionalFlowsPurchased: true,
        proUnlimitedFlows: true,
        currentVersion: true,
        stripeCustomerId: true,
      },
    });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");

    console.log(
      "[ProService.getAppStatus] user.hasPro:",
      user.hasPro,
      "currentVersion:",
      user.currentVersion,
    );

    let proFlowsUsed = 0;
    if (user.hasPro) {
      proFlowsUsed = await prisma.flow.count({
        where: { ownerId: userId, deletedAt: null, appContext: "pro" },
      });
    }

    const maxFlows = user.proFlowLimit + user.proAdditionalFlowsPurchased;

    return {
      currentApp: user.currentVersion || "free",
      hasPro: user.hasPro,
      proPurchasedAt: user.proPurchasedAt,
      isUnlimited: user.proUnlimitedFlows,
      proFlows: {
        used: proFlowsUsed,
        max: user.proUnlimitedFlows ? -1 : maxFlows,
        baseLimit: user.proFlowLimit,
        extraPurchased: user.proAdditionalFlowsPurchased,
      },
    };
  }

  async verifyPurchase(userId, sessionId) {
    console.log(
      "[ProService.verifyPurchase] userId:",
      userId,
      "sessionId:",
      sessionId,
    );

    if (!sessionId) {
      throw new AppError("Missing session_id", 400, "VALIDATION_ERROR");
    }

    const stripe = getStripe();

    // Retrieve the checkout session from Stripe
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
      console.log(
        "[ProService.verifyPurchase] Stripe session status:",
        session.payment_status,
        "metadata:",
        JSON.stringify(session.metadata),
      );
    } catch (err) {
      console.error(
        "[ProService.verifyPurchase] Stripe retrieve failed:",
        err.message,
      );
      throw new AppError(
        "Failed to verify payment with Stripe",
        500,
        "STRIPE_ERROR",
      );
    }

    // Verify payment was successful
    if (session.payment_status !== "paid") {
      console.log(
        "[ProService.verifyPurchase] Payment not completed, status:",
        session.payment_status,
      );
      return { verified: false, message: "Payment not completed yet" };
    }

    // Verify this session belongs to this user
    if (session.metadata?.userId !== String(userId)) {
      console.error(
        "[ProService.verifyPurchase] userId mismatch. Session:",
        session.metadata?.userId,
        "Request:",
        userId,
      );
      throw new AppError(
        "Session does not belong to this user",
        403,
        "FORBIDDEN",
      );
    }

    // Verify it's a Pro purchase
    if (session.metadata?.purchaseType !== "pro_upgrade") {
      throw new AppError("Not a Pro purchase session", 400, "INVALID_SESSION");
    }

    // Check if already activated
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { hasPro: true },
    });

    if (user?.hasPro) {
      console.log(
        "[ProService.verifyPurchase] Already active for user:",
        userId,
      );
      return { verified: true, alreadyActive: true };
    }

    // ACTIVATE PRO — backup in case webhook was slow/failed
    console.log("[ProService.verifyPurchase] Activating Pro for user:", userId);
    await prisma.user.update({
      where: { id: userId },
      data: {
        hasPro: true,
        proPurchasedAt: new Date(),
        currentVersion: "pro",
      },
    });

    // Grant 100 AI credits/month (idempotent — webhook may also do this)
    const nextReset = new Date();
    nextReset.setMonth(nextReset.getMonth() + 1);
    nextReset.setDate(1);
    nextReset.setHours(0, 0, 0, 0);
    await prisma.aiCreditBalance.upsert({
      where: { userId },
      create: {
        userId,
        planCredits: 100,
        addonCredits: 0,
        planResetsAt: nextReset,
        appContext: "pro",
      },
      update: {
        planCredits: 100,
        appContext: "pro",
        planResetsAt: nextReset,
      },
    });

    // Log transaction (only if not already logged by webhook)
    const existingTxn = await prisma.transactionLog.findFirst({
      where: { txnId: sessionId },
    });
    if (!existingTxn) {
      await prisma.transactionLog.create({
        data: {
          userId,
          chargeId: session.payment_intent || session.id,
          txnId: session.id,
          amountCharged: session.amount_total || 100,
          currency: session.currency || getStripeCurrency(),
          status: "success",
          paymentMethod: session.payment_method_types?.[0] || "card",
          appType: "individual",
        },
      });
    }

    logger.info(`Pro activated via verify-purchase for user: ${userId}`);
    return { verified: true, activated: true };
  }

  async switchApp(userId, app) {
    if (app !== "free" && app !== "pro") {
      throw new AppError(
        'Invalid app type. Use "free" or "pro"',
        400,
        "VALIDATION_ERROR",
      );
    }

    if (app === "pro") {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { proPurchasedAt: true },
      });
      if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
      // Pro is a separate one-time $1 product. A team-plan subscriber
      // does NOT automatically own Pro — they have to buy it explicitly
      // (Team grants Pro-tier features within the Team workspace, but the
      // standalone Pro app is its own product).
      if (!user.proPurchasedAt) {
        const checkout = await this.createProPurchaseCheckout(userId);
        return {
          requiresPurchase: true,
          message:
            "Purchase Pro ($1 one-time) to access this app. Redirecting to checkout.",
          ...checkout,
        };
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: { currentVersion: app },
    });

    return { currentApp: app };
  }

  async createProPurchaseCheckout(userId, pendingInviteToken = null) {
    const stripe = getStripe();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        hasPro: true,
        proPurchasedAt: true,
        email: true,
        stripeCustomerId: true,
      },
    });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
    // Pro is a separate one-time $1 product. A team-plan subscriber has
    // hasPro=true but proPurchasedAt=null — they still need to buy the
    // standalone Pro product. Only block if they've already purchased it
    // explicitly.
    if (user.proPurchasedAt) {
      throw new AppError("You already have Pro access", 400, "ALREADY_PRO");
    }

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

    const sessionConfig = {
      mode: "payment",
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: getStripeCurrency(),
            product_data: {
              name: "ValueChart Pro",
              description:
                "One-time payment — Lifetime access to all Pro & Team features",
            },
            unit_amount: 100, // $1.00 lifetime
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId,
        purchaseType: "pro_upgrade",
        ...(pendingInviteToken
          ? { pendingInviteToken: String(pendingInviteToken).slice(0, 128) }
          : {}),
      },
      // Stripe Adaptive Pricing (account-level setting) converts to local currency
      success_url: `${baseUrl}/upgrade-pro/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/upgrade-pro`,
    };

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return { sessionId: session.id, url: session.url };
  }

  async createFlowPurchaseCheckout(userId, flowPackage) {
    const stripe = getStripe();
    const amount = FLOW_PRICING[flowPackage];
    if (!amount) {
      throw new AppError(
        'Invalid package. Choose "50" or "unlimited"',
        400,
        "VALIDATION_ERROR",
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        hasPro: true,
        currentVersion: true,
        proUnlimitedFlows: true,
        stripeCustomerId: true,
        email: true,
      },
    });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
    if (!user.hasPro) {
      throw new AppError("Pro access required", 403, "PRO_REQUIRED");
    }
    if (user.proUnlimitedFlows) {
      throw new AppError(
        "You already have unlimited flows",
        400,
        "ALREADY_UNLIMITED",
      );
    }

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

    const isUnlimited = flowPackage === "unlimited";
    const flowCount = isUnlimited ? -1 : 50;
    const productName = isUnlimited ? "Unlimited Flows" : "50 Flows Pack";
    const description = isUnlimited
      ? "Unlimited Flows for ValueChart Pro"
      : "50 Additional Flows for ValueChart Pro";

    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: getStripeCurrency(),
            product_data: {
              name: productName,
              description,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId,
        purchaseType: "pro_extra_flows",
        flowPackage,
        flowCount: String(flowCount),
      },
      // Stripe Adaptive Pricing (account-level setting) converts to local currency
      // session_id is needed by the success page to call the verify-purchase
      // fallback when the Stripe webhook hasn't reached the backend yet
      // (common in local dev without `stripe listen`).
      success_url: `${baseUrl}/dashboard/subscription?purchased=${flowPackage}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/dashboard/subscription`,
    });

    return { sessionId: session.id, url: session.url };
  }

  async handleProUpgradeWebhook(session) {
    const userId = session.metadata.userId;
    console.log("=== WEBHOOK: pro_upgrade ===");
    console.log("userId:", userId);
    console.log("Payment Intent:", session.payment_intent);
    if (!userId) {
      console.error("[handleProUpgradeWebhook] No userId in metadata!");
      return;
    }

    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          hasPro: true,
          proPurchasedAt: new Date(),
          currentVersion: "pro",
        },
      });
      console.log(
        "[handleProUpgradeWebhook] Database updated: hasPro=true for user:",
        userId,
      );
    } catch (err) {
      console.error(
        "[handleProUpgradeWebhook] FAILED to update user:",
        err.message,
      );
      throw err;
    }

    // Grant 100 AI credits/month (Pro plan) immediately on purchase.
    const nextReset = new Date();
    nextReset.setMonth(nextReset.getMonth() + 1);
    nextReset.setDate(1);
    nextReset.setHours(0, 0, 0, 0);
    try {
      await prisma.aiCreditBalance.upsert({
        where: { userId },
        create: {
          userId,
          planCredits: 100,
          addonCredits: 0,
          planResetsAt: nextReset,
          appContext: "pro",
        },
        update: {
          planCredits: 100,
          appContext: "pro",
          planResetsAt: nextReset,
        },
      });
    } catch (err) {
      console.error(
        "[handleProUpgradeWebhook] Failed to upsert credits:",
        err.message,
      );
    }

    // Log transaction (skip if already logged by verify-purchase)
    const existingTxn = await prisma.transactionLog.findFirst({
      where: { txnId: session.id },
    });
    if (!existingTxn) {
      await prisma.transactionLog.create({
        data: {
          userId,
          chargeId: session.payment_intent || session.id,
          txnId: session.id,
          amountCharged: session.amount_total || 100,
          currency: session.currency || getStripeCurrency(),
          status: "success",
          paymentMethod: session.payment_method_types?.[0] || "card",
          appType: "individual",
        },
      });
    }

    // Welcome email (best-effort, non-blocking)
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });
      if (user?.email) {
        const { sendEmail } = require("../utils/email");
        const dashUrl = `${process.env.APP_URL || "http://localhost:3000"}/dashboard`;
        await sendEmail({
          to: user.email,
          subject: "Welcome to ValueChart Pro!",
          html: `
            <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1A1A2E">
              <h2 style="color:#3CB371;margin:0 0 12px">Welcome to ValueChart Pro!</h2>
              <p>Hi ${user.name || "there"},</p>
              <p>Your ValueChart Pro lifetime access is now active.</p>
              <h3 style="margin-top:20px">What you get</h3>
              <ul style="line-height:1.8">
                <li>100 AI diagram credits/month</li>
                <li>All team features — FREE</li>
                <li>Unlimited team members</li>
                <li>Team chat</li>
                <li>10 flows included</li>
              </ul>
              <p>Need more flows? Buy a flow pack (50 flows for $5 or unlimited for $10) anytime from your dashboard.</p>
              <p style="margin-top:20px">
                <a href="${dashUrl}" style="background:#3CB371;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">Go to Dashboard</a>
              </p>
              <p style="color:#888;font-size:12px;margin-top:24px">ValueChart Pro — Lifetime Access</p>
            </div>
          `,
        });
      }
    } catch (err) {
      console.error("[handleProUpgradeWebhook] Email failed:", err.message);
    }

    // Auto-accept pending team invitation if the checkout was started from
    // an invite link (Pro app flow: "Buy Pro $1 then join team").
    const pendingInviteToken = session.metadata?.pendingInviteToken;
    if (pendingInviteToken) {
      try {
        const teamService = require("./team.service");
        const result = await teamService.acceptInvite(
          pendingInviteToken,
          userId,
        );
        logger.info(
          `[handleProUpgradeWebhook] Auto-accepted invite token=${pendingInviteToken} → team=${result?.teamId}`,
        );
      } catch (err) {
        // Non-fatal — Pro is granted; user can re-click the invite link.
        console.error(
          "[handleProUpgradeWebhook] Auto-accept invite failed:",
          err.message,
        );
      }
    }

    // Best-effort push notification.
    try {
      const fcm = require("./fcm.service");
      await fcm.sendToUser(
        userId,
        "Welcome to ValueChart Pro!",
        "Your lifetime Pro access is now active.",
        { type: "payment", url: "/dashboard" },
      );
    } catch (err) {
      console.warn("[handleProUpgradeWebhook] Push failed:", err.message);
    }

    logger.info(`Pro purchased for user: ${userId}`);
  }

  // Success-URL fallback for flow-pack purchases — same role as
  // verifyPurchase() does for the $1 Pro upgrade. Idempotent: dedupes on
  // ProFlowPurchase.stripePaymentIntentId so a webhook arriving later
  // won't double-credit. Used when the Stripe webhook hasn't reached
  // this backend yet (e.g. local dev without `stripe listen`).
  async verifyExtraFlowsPurchase(userId, sessionId) {
    if (!sessionId) {
      throw new AppError("Missing session_id", 400, "VALIDATION_ERROR");
    }
    const stripe = getStripe();
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (err) {
      throw new AppError(
        "Failed to verify payment with Stripe",
        500,
        "STRIPE_ERROR",
      );
    }

    if (session.payment_status !== "paid") {
      return { verified: false, message: "Payment not completed yet" };
    }
    if (session.metadata?.userId !== String(userId)) {
      throw new AppError(
        "Session does not belong to this user",
        403,
        "FORBIDDEN",
      );
    }
    if (session.metadata?.purchaseType !== "pro_extra_flows") {
      throw new AppError(
        "Not a flow-pack purchase session",
        400,
        "INVALID_SESSION",
      );
    }

    const paymentIntentId = session.payment_intent || session.id;

    // Idempotency check
    const existing = await prisma.proFlowPurchase.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (existing) {
      return { verified: true, alreadyActive: true };
    }

    // Credit the account using the same logic as the webhook.
    await this.handleExtraFlowsWebhook(session);
    return { verified: true, activated: true };
  }

  async handleExtraFlowsWebhook(session) {
    const userId = session.metadata.userId;
    const flowPackage = session.metadata.flowPackage;
    const flowCount = parseInt(session.metadata.flowCount);
    if (!userId) return;

    // Idempotency — skip if the verify-purchase fallback already credited
    // this session (or a duplicate webhook delivery is being retried).
    const paymentIntentId = session.payment_intent || session.id;
    const already = await prisma.proFlowPurchase.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (already) {
      logger.info(
        `[handleExtraFlowsWebhook] Skip — already credited for ${paymentIntentId}`,
      );
      return;
    }

    const isUnlimited = flowPackage === "unlimited";
    const packType = isUnlimited ? "unlimited" : "fifty_flows";

    // Find the user's current active pack — if any, this is a RENEWAL and
    // the new pack's expiry stacks on top of the old one's expiry (not
    // "now"), preserving any unused time.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        activeFlowPackId: true,
        flowPackExpiresAt: true,
        proAdditionalFlowsPurchased: true,
      },
    });
    const previousActive = user?.activeFlowPackId
      ? await prisma.proFlowPurchase.findUnique({
          where: { id: user.activeFlowPackId },
        })
      : null;

    const now = new Date();
    const isRenewal = !!(previousActive && previousActive.status === "active");
    const baseExpiry =
      isRenewal && previousActive.expiresAt && previousActive.expiresAt > now
        ? previousActive.expiresAt
        : now;
    const expiresAt = new Date(baseExpiry.getTime() + 30 * 24 * 3600 * 1000);
    const gracePeriodEndsAt = new Date(
      expiresAt.getTime() + 3 * 24 * 3600 * 1000,
    );

    // Mark old pack as renewed (one active pack per user).
    if (isRenewal) {
      await prisma.proFlowPurchase.update({
        where: { id: previousActive.id },
        data: { status: "renewed" },
      });
    }

    // Create the new pack record.
    const newPack = await prisma.proFlowPurchase.create({
      data: {
        userId,
        flowCount: isUnlimited ? -1 : flowCount,
        amountCents: session.amount_total || 0,
        stripePaymentIntentId: paymentIntentId,
        packType,
        isUnlimited,
        expiresAt,
        gracePeriodEndsAt,
        status: "active",
        renewedFromId: isRenewal ? previousActive.id : null,
      },
    });

    // Update user entitlements & active pack pointer.
    const userUpdate = {
      activeFlowPackId: newPack.id,
      flowPackExpiresAt: expiresAt,
      isInFlowPickerPhase: false,
    };
    if (isUnlimited) {
      userUpdate.proUnlimitedFlows = true;
    } else {
      // 50-flow pack increments the additional bucket (stacks across
      // historical packs in `getAllFlows` count math, but that's fine —
      // the active pack is what enforces post-expiry).
      userUpdate.proAdditionalFlowsPurchased = { increment: flowCount };
    }
    await prisma.user.update({ where: { id: userId }, data: userUpdate });

    // Auto-restore flows that were trashed by a prior expiry. Only flows
    // still soft-deleted (deletedAt set) and flagged markedForDowngrade
    // are eligible. Hard-purged trash is unrecoverable.
    let restored = 0;
    if (isRenewal || previousActive) {
      const restoreResult = await prisma.flow.updateMany({
        where: {
          ownerId: userId,
          markedForDowngrade: true,
          deletedAt: { not: null },
        },
        data: { deletedAt: null, markedForDowngrade: false },
      });
      restored = restoreResult.count;
      if (restored > 0) {
        const { sendEmail } = require("../utils/email");
        const { emailTemplates } = require("../utils/email");
        const u = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, name: true },
        });
        if (u?.email && emailTemplates?.flowsRestoredOnRenewal) {
          const tpl = emailTemplates.flowsRestoredOnRenewal(u, restored);
          sendEmail({ to: u.email, ...tpl }).catch(() => {});
        }
        await prisma.notification.create({
          data: {
            userId,
            type: "flows_restored",
            title: "Flows restored",
            message: `${restored} flow${restored === 1 ? "" : "s"} restored on plan renewal.`,
            actionUrl: "/dashboard/flows",
          },
        });
      }
    }

    // Transaction log row (filtered by appType in billing UI).
    await prisma.transactionLog.create({
      data: {
        userId,
        chargeId: paymentIntentId,
        txnId: session.id,
        amountCharged: session.amount_total || 0,
        currency: session.currency || getStripeCurrency(),
        status: "success",
        paymentMethod: session.payment_method_types?.[0] || "card",
        appType: "individual",
      },
    });

    logger.info(
      `[handleExtraFlowsWebhook] user=${userId} pack=${packType} expiresAt=${expiresAt.toISOString()} renewal=${isRenewal} restored=${restored}`,
    );
  }

  async checkProFlowLimit(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        hasPro: true,
        currentVersion: true,
        proFlowLimit: true,
        proAdditionalFlowsPurchased: true,
        proUnlimitedFlows: true,
      },
    });

    if (!user || !user.hasPro || user.currentVersion !== "pro") {
      return { isPro: false };
    }

    // Unlimited — no limit
    if (user.proUnlimitedFlows) {
      return {
        isPro: true,
        allowed: true,
        used: 0,
        max: -1,
        isUnlimited: true,
      };
    }

    const flowCount = await prisma.flow.count({
      where: { ownerId: userId, deletedAt: null, appContext: "pro" },
    });
    const maxFlows = user.proFlowLimit + user.proAdditionalFlowsPurchased;

    if (flowCount >= maxFlows) {
      throw new AppError(
        `Pro flow limit reached. You have used ${flowCount} of ${maxFlows} flows. Purchase additional flows to create more.`,
        403,
        "PRO_FLOW_LIMIT_REACHED",
      );
    }

    return { isPro: true, allowed: true, used: flowCount, max: maxFlows };
  }

  getFlowPricing() {
    return [
      {
        package: "50",
        flowCount: 50,
        amountCents: 500,
        amountDisplay: "$5.00",
        description: "Added to your current balance",
      },
      {
        package: "unlimited",
        flowCount: -1,
        amountCents: 1000,
        amountDisplay: "$10.00",
        description: "Never worry about flow limits again",
      },
    ];
  }

  async getProSubscriptionStatus(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        hasPro: true,
        proFlowLimit: true,
        proAdditionalFlowsPurchased: true,
        proUnlimitedFlows: true,
      },
    });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
    if (!user.hasPro) {
      throw new AppError("Pro access required", 403, "PRO_REQUIRED");
    }

    const flowCount = await prisma.flow.count({
      where: { ownerId: userId, deletedAt: null, appContext: "pro" },
    });

    const totalFlows = user.proUnlimitedFlows
      ? -1
      : user.proFlowLimit + user.proAdditionalFlowsPurchased;
    const remaining = user.proUnlimitedFlows ? -1 : totalFlows - flowCount;

    const purchases = await prisma.proFlowPurchase.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return {
      plan: "Pro",
      originalPrice: "$1",
      isUnlimited: user.proUnlimitedFlows,
      flows: {
        free: user.proFlowLimit,
        purchased: user.proAdditionalFlowsPurchased,
        total: totalFlows,
        used: flowCount,
        remaining,
      },
      purchases: purchases.map((p) => ({
        id: p.id,
        flowCount: p.flowCount,
        amountCents: p.amountCents,
        createdAt: p.createdAt,
      })),
    };
  }
}

module.exports = new ProService();
