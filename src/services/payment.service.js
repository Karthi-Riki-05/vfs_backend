const { prisma } = require("../lib/prisma");
const {
  getStripe,
  getStripeCurrency,
  getStripeWebhookSecret,
} = require("../lib/stripe");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const proService = require("./pro.service");
const { sendEmail, emailTemplates } = require("../utils/email");
const downgradeUser = require("../lib/downgradeUser");
const { grantTeamCredits } = require("./aiCredit.service");

class PaymentService {
  async createCheckoutSession(userId, planId, urls = {}) {
    const stripe = getStripe();
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new AppError("Plan not found", 404, "NOT_FOUND");

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");

    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    const session = await stripe.checkout.sessions.create({
      mode:
        plan.price === 0
          ? "setup"
          : plan.duration === "monthly" || plan.duration === "yearly"
            ? "subscription"
            : "payment",
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: getStripeCurrency(),
            product_data: {
              name: plan.name,
              description: `ValueChart ${plan.appType || ""} Plan`,
            },
            unit_amount: Math.round(plan.price * 100),
            ...(plan.duration && {
              recurring: {
                interval: plan.duration === "yearly" ? "year" : "month",
              },
            }),
          },
          quantity: 1,
        },
      ],
      metadata: { userId, planId, appType: plan.appType || "" },
      success_url:
        urls.successUrl ||
        `${baseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: urls.cancelUrl || `${baseUrl}/subscription`,
    });

    return { sessionId: session.id, url: session.url };
  }

  async handleWebhook(rawBody, signature) {
    const stripe = getStripe();
    const webhookSecret = getStripeWebhookSecret();
    if (!webhookSecret)
      throw new AppError("Webhook secret not configured", 503, "CONFIG_ERROR");

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      logger.error("Stripe webhook signature verification failed", {
        error: err.message,
      });
      throw new AppError("Invalid webhook signature", 400, "INVALID_SIGNATURE");
    }

    logger.info(`Stripe webhook received: ${event.type}`, {
      eventId: event.id,
    });
    console.log("[Webhook][payment.service]", event.type, "received");

    // Webhook processors MUST always return 200 to Stripe to prevent infinite
    // retries. Catch any internal error, log it, and acknowledge receipt.
    try {
      switch (event.type) {
        case "checkout.session.completed":
          await this._handleCheckoutComplete(event.data.object);
          break;
        case "invoice.paid":
          await this._handleInvoicePaid(event.data.object);
          break;
        case "invoice.payment_failed":
          await this._handlePaymentFailed(event.data.object);
          break;
        case "customer.subscription.updated":
          await this._handleSubscriptionUpdated(event.data.object);
          break;
        case "customer.subscription.deleted":
          await this._handleSubscriptionDeleted(event.data.object);
          break;
        case "charge.refunded":
          await this._handleChargeRefunded(event.data.object);
          break;
        default:
          logger.info(`Unhandled webhook event: ${event.type}`);
      }
    } catch (err) {
      logger.error(`[Webhook] event processing failed: ${event.type}`, {
        eventId: event.id,
        error: err.message,
      });
      // Return 200 anyway — Stripe must not retry on application-level errors
    }

    return { received: true };
  }

  async _handleChargeRefunded(charge) {
    const isFull = charge.amount_refunded >= charge.amount;
    const newStatus = isFull ? "refunded" : "partially_refunded";

    const idCandidates = [charge.id, charge.payment_intent].filter(Boolean);

    // Update transaction log(s) for this charge / payment_intent
    await prisma.transactionLog.updateMany({
      where: {
        OR: [
          ...idCandidates.map((id) => ({ chargeId: id })),
          ...idCandidates.map((id) => ({ txnId: id })),
        ],
      },
      data: { status: newStatus, updatedAt: new Date() },
    });

    // Find the txn directly to get user
    const txLog = await prisma.transactionLog.findFirst({
      where: {
        OR: [
          ...idCandidates.map((id) => ({ chargeId: id })),
          ...idCandidates.map((id) => ({ txnId: id })),
        ],
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const user = txLog?.user || null;

    if (user?.email) {
      const amount = (charge.amount_refunded / 100).toFixed(2);
      const currency = (charge.currency || "usd").toUpperCase();
      sendEmail({
        to: user.email,
        subject: "Refund Processed — ValueChart",
        html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff">
  <div style="text-align:center;padding:24px 0;background:#3CB371;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:22px">Refund Processed ✅</h1>
  </div>
  <div style="padding:32px 24px;border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px">
    <p style="font-size:15px">Hi ${user.name || "there"},</p>
    <p style="font-size:15px;line-height:1.6">A refund of <strong>${currency} $${amount}</strong> has been processed to your original payment method.</p>
    <p style="font-size:14px;color:#666">Please allow 5–10 business days for it to appear on your statement.</p>
    <p style="color:#888;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:16px">Questions? Reply to this email or contact support.</p>
  </div>
</div>`,
        text: `Hi ${user.name || "there"},\n\nA refund of ${currency} $${amount} has been processed. Allow 5-10 business days for it to appear on your statement.`,
      }).catch((err) =>
        logger.error(`[Email] refund send failed: ${err.message}`),
      );
    }

    logger.info(
      `[Webhook] Refund processed: charge=${charge.id} amount=${charge.amount_refunded}/${charge.amount} status=${newStatus}`,
    );
  }

  async _handleCheckoutComplete(session) {
    const purchaseType = session.metadata?.purchaseType;
    console.log("=== WEBHOOK: checkout.session.completed ===");
    console.log("Payment Intent:", session.payment_intent);
    console.log("Metadata:", JSON.stringify(session.metadata));
    console.log("Purchase Type:", purchaseType);

    // Route Pro purchases to ProService
    if (purchaseType === "pro_upgrade") {
      console.log(
        "[_handleCheckoutComplete] Routing to proService.handleProUpgradeWebhook",
      );
      return await proService.handleProUpgradeWebhook(session);
    }
    if (purchaseType === "pro_extra_flows") {
      console.log(
        "[_handleCheckoutComplete] Routing to proService.handleExtraFlowsWebhook",
      );
      return await proService.handleExtraFlowsWebhook(session);
    }
    if (purchaseType === "flow_addon") {
      console.log(
        "[_handleCheckoutComplete] Routing to proService.handleFlowAddonCheckoutWebhook",
      );
      return await proService.handleFlowAddonCheckoutWebhook(session);
    }
    if (purchaseType === "ai_addon_credits") {
      const { userId: uid, credits, packType } = session.metadata || {};
      const amount = parseInt(credits, 10);
      if (!uid || !amount || amount <= 0) {
        logger.warn(
          `[ai_addon_credits] Missing userId or credits in metadata: ${JSON.stringify(session.metadata)}`,
        );
        return;
      }

      // Idempotency: if we've already logged this Stripe session, bail out
      // before granting credits again (Stripe retries failed webhooks).
      const existingTxn = await prisma.transactionLog.findFirst({
        where: { txnId: session.id },
      });
      if (existingTxn) {
        logger.info(
          `[ai_addon_credits] Session ${session.id} already processed — skipping`,
        );
        return;
      }

      // Prefer the appContext + teamId captured at checkout time (so a
      // team-context purchase routes to the team owner's balance even if
      // the user switched workspace before the webhook arrived). Fall
      // back to the user's currentVersion when metadata is missing.
      const metaAppContext = session.metadata?.appContext;
      const metaTeamId = session.metadata?.teamId || null;
      let appContext = metaAppContext;
      if (!appContext) {
        const user = await prisma.user.findUnique({
          where: { id: uid },
          select: { currentVersion: true },
        });
        appContext = user?.currentVersion || "free";
      }

      const { addAddonCredits } = require("./aiCredit.service");
      await addAddonCredits(uid, amount, appContext, metaTeamId);
      logger.info(
        `[ai_addon_credits] Added ${amount} credits for user ${uid} appContext=${appContext} (session: ${session.id})`,
      );

      const amountTotal = session.amount_total || 0;
      const currency = session.currency || getStripeCurrency();
      const planLabel = `AI Credits Addon${packType ? ` — ${packType}` : ""} (${amount} credits)`;

      // Audit row (admin transaction log) and user-facing subscription
      // history row, in a single transaction so they stay in sync.
      // Both rows are tagged with appContext so each app's Billing /
      // History page only shows its own purchases.
      await prisma.$transaction([
        prisma.transactionLog.create({
          data: {
            userId: uid,
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
            userId: uid,
            planName: planLabel,
            productType: "ai_addon_credits",
            status: "completed",
            // Stripe amount_total is in the smallest currency unit (cents/paise)
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
              packType: packType || null,
              credits: amount,
              appContext,
            },
          },
        }),
      ]);
      return;
    }

    const { userId, planId, appType } = session.metadata;
    if (!userId || !planId) return;

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const seats = parseInt(session.metadata?.teamMembers || "5", 10);
    const plan = session.metadata?.plan || "monthly";

    await prisma.$transaction([
      prisma.subscription.upsert({
        where: { userId },
        update: {
          planId,
          status: "active",
          paymentId: session.payment_intent || session.subscription,
          startedAt: new Date(),
          expiresAt,
          appType: appType || null,
          usersCount: seats,
          plan,
        },
        create: {
          userId,
          planId,
          status: "active",
          paymentId: session.payment_intent || session.subscription,
          price: (session.amount_total || 0) / 100,
          startedAt: new Date(),
          expiresAt,
          appType: appType || null,
          usersCount: seats,
          plan,
        },
      }),
      prisma.transactionLog.create({
        data: {
          userId,
          chargeId: session.payment_intent || session.id,
          txnId: session.id,
          amountCharged: session.amount_total || 0,
          currency: session.currency || getStripeCurrency(),
          status: "success",
          paymentMethod: session.payment_method_types?.[0] || "card",
          appType: "enterprise",
          appContext: "team",
        },
      }),
    ]);

    // Grant seat-scaled AI credits to the team owner immediately on activation.
    await grantTeamCredits(userId, seats, plan).catch((err) =>
      logger.error(
        `[Checkout] grantTeamCredits failed for ${userId}: ${err.message}`,
      ),
    );

    // Upgrade user currentVersion to "team" so they see the Team workspace.
    await prisma.user
      .update({
        where: { id: userId },
        data: { currentVersion: "team", hasPro: true },
      })
      .catch((err) =>
        logger.error(
          `[Checkout] user update to team failed for ${userId}: ${err.message}`,
        ),
      );

    logger.info(
      `Subscription activated for user ${userId}, plan ${planId}, seats ${seats}`,
    );
  }

  async _handleInvoicePaid(invoice) {
    if (!invoice.subscription) return;

    // Idempotency: skip if this invoice was already processed.
    const existingTxn = await prisma.transactionLog.findFirst({
      where: { txnId: invoice.id },
    });
    if (existingTxn) {
      logger.info(
        `[payment._handleInvoicePaid] Invoice ${invoice.id} already processed — skipping`,
      );
      return;
    }

    const sub = await prisma.subscription.findFirst({
      where: { paymentId: invoice.subscription },
    });
    if (!sub) return;

    // Prefer Stripe's authoritative period_end; fall back to +1 month.
    const periodEnd = invoice.lines?.data?.[0]?.period?.end;
    const expiresAt = periodEnd
      ? new Date(periodEnd * 1000)
      : (() => {
          const d = new Date();
          const isYearly =
            sub.productType === "team_yearly" ||
            sub.productType === "pro_yearly";
          isYearly
            ? d.setFullYear(d.getFullYear() + 1)
            : d.setMonth(d.getMonth() + 1);
          return d;
        })();

    const isTeam =
      sub.productType === "team_monthly" || sub.productType === "team_yearly";

    if (isTeam) {
      const seats = sub.usersCount || 5;
      const isYearly = sub.productType === "team_yearly";
      const credits = isYearly ? seats * 60 * 12 : seats * 60;

      await prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: sub.id },
          data: { status: "active", expiresAt },
        });

        await tx.aiCreditBalance.upsert({
          where: {
            userId_appContext: { userId: sub.userId, appContext: "team" },
          },
          create: {
            userId: sub.userId,
            planCredits: credits,
            addonCredits: 0,
            planResetsAt: expiresAt,
            appContext: "team",
          },
          update: { planCredits: credits, planResetsAt: expiresAt },
        });

        await tx.transactionLog.create({
          data: {
            userId: sub.userId,
            txnId: invoice.id,
            chargeId: invoice.payment_intent || invoice.id,
            amountCharged: invoice.amount_paid || 0,
            currency: invoice.currency || "usd",
            status: "success",
            paymentMethod: "card",
            appType: "enterprise",
            appContext: "team",
          },
        });
      });

      logger.info(
        `[payment._handleInvoicePaid] Renewed: user=${sub.userId} seats=${seats} credits=${credits}`,
      );
    } else {
      // Non-team subscription: just update expiry.
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "active", expiresAt },
      });
    }
  }

  async _handlePaymentFailed(invoice) {
    if (!invoice.subscription) {
      logger.warn(`Payment failed for invoice ${invoice.id} (no sub)`);
      return;
    }
    const sub = await prisma.subscription.findFirst({
      where: { paymentId: invoice.subscription },
      include: {
        user: { select: { id: true, name: true, email: true } },
        plan: { select: { name: true } },
      },
    });
    if (!sub) return;

    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "past_due" },
    });
    logger.warn(
      `Payment failed for invoice ${invoice.id} (attempt ${invoice.attempt_count})`,
    );

    if (invoice.attempt_count >= 4) {
      logger.error(
        `[Payment] FINAL payment failure for user ${sub.userId}. Stripe will cancel subscription.`,
      );
    }

    if (sub.user?.email) {
      const tpl = emailTemplates.paymentFailed(
        sub.user,
        sub.plan?.name || "Your Plan",
      );
      sendEmail({ to: sub.user.email, ...tpl }).catch((err) =>
        logger.error(`[Email] paymentFailed send failed: ${err.message}`),
      );
    }
  }

  async _handleSubscriptionUpdated(subscription) {
    // Check if this is a flow add-on subscription first
    const addonUser = await prisma.user.findFirst({
      where: { flowAddonStripeSubId: subscription.id },
      select: { id: true },
    });
    if (addonUser) {
      return await proService.handleFlowAddonSubscriptionUpdated(
        addonUser.id,
        subscription.status,
        subscription.current_period_end,
      );
    }

    // Otherwise treat as a team subscription
    const sub = await prisma.subscription.findFirst({
      where: { paymentId: subscription.id },
    });
    if (sub) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status:
            subscription.status === "active" ? "active" : subscription.status,
        },
      });
    }
  }

  async _handleSubscriptionDeleted(subscription) {
    // Check if this is a flow add-on subscription first
    const addonUser = await prisma.user.findFirst({
      where: { flowAddonStripeSubId: subscription.id },
      select: { id: true },
    });
    if (addonUser) {
      return await proService.handleFlowAddonSubscriptionDeleted(addonUser.id);
    }

    // Otherwise treat as a team subscription
    const sub = await prisma.subscription.findFirst({
      where: { paymentId: subscription.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!sub) return;

    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "cancelled", deletedAt: new Date() },
    });

    // CRITICAL: revoke paid access (Pro lifetime preserved if proPurchasedAt set)
    await downgradeUser(sub.userId, { reason: "subscription_deleted" });

    if (sub.user?.email) {
      const tpl = emailTemplates.subscriptionCancelled(sub.user, sub.expiresAt);
      sendEmail({ to: sub.user.email, ...tpl }).catch((err) =>
        logger.error(
          `[Email] subscriptionCancelled send failed: ${err.message}`,
        ),
      );
    }
  }

  async getTransactions(userId, options = {}) {
    const { page = 1, limit = 20, appType } = options;
    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    // Direct lookup by userId (new column). Fall back to legacy lookup
    // via subscription.paymentId for transactions stamped before the
    // user_id column existed.
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });
    const legacyOr = subscription?.paymentId
      ? [
          { chargeId: subscription.paymentId },
          { txnId: subscription.paymentId },
        ]
      : [];

    const where = {
      OR: [{ userId }, ...legacyOr],
    };

    // App-type filter: 'individual' = Pro purchases, 'enterprise' = Team
    // subscription. Untagged legacy rows are returned only when no filter
    // is requested, so the Pro/Team billing pages stay clean.
    if (appType === "individual" || appType === "enterprise") {
      where.appType = appType;
    }

    const [transactions, total] = await Promise.all([
      prisma.transactionLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.transactionLog.count({ where }),
    ]);

    return {
      transactions,
      total,
      page: Number(page) || 1,
      totalPages: Math.ceil(total / take),
    };
  }
}

module.exports = new PaymentService();
