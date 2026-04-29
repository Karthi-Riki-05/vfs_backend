const { prisma } = require("../lib/prisma");
const { getStripe, getStripeCurrency } = require("../lib/stripe");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const proService = require("./pro.service");
const { sendEmail, emailTemplates } = require("../utils/email");

// Reset paid user back to free tier — called when Stripe sub is deleted/expired.
async function downgradeUser(userId) {
  if (!userId) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, hasPro: true, currentVersion: true },
  });
  if (!user) return;
  if (!user.hasPro && user.currentVersion === "free") return;

  await prisma.user.update({
    where: { id: userId },
    data: {
      hasPro: false,
      currentVersion: "free",
      proUnlimitedFlows: false,
      proFlowLimit: 10,
    },
  });

  await prisma.aiCreditBalance.updateMany({
    where: { userId },
    data: { planCredits: 20 },
  });

  logger.info(`[Payment] User ${userId} downgraded to free`);
}

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
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
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
    if (purchaseType === "ai_addon_credits") {
      const { userId: uid, credits } = session.metadata || {};
      const amount = parseInt(credits, 10);
      if (!uid || !amount || amount <= 0) {
        logger.warn(
          `[ai_addon_credits] Missing userId or credits in metadata: ${JSON.stringify(session.metadata)}`,
        );
        return;
      }
      const { addAddonCredits } = require("./aiCredit.service");
      // Use the balance's own appContext (falls back to 'free' inside service)
      await addAddonCredits(uid, amount, "free");
      logger.info(
        `[ai_addon_credits] Added ${amount} credits for user ${uid} (session: ${session.id})`,
      );

      // Idempotency guard — don't double-log transaction
      const existingTxn = await prisma.transactionLog.findFirst({
        where: { txnId: session.id },
      });
      if (!existingTxn) {
        await prisma.transactionLog.create({
          data: {
            userId: uid,
            chargeId: session.payment_intent || session.id,
            txnId: session.id,
            amountCharged: session.amount_total || 0,
            currency: session.currency || getStripeCurrency(),
            status: "success",
            paymentMethod: session.payment_method_types?.[0] || "card",
            appType: "individual",
          },
        });
      }
      return;
    }

    const { userId, planId, appType } = session.metadata;
    if (!userId || !planId) return;

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

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
          // Team plan = enterprise (Pro = individual). Drives billing
          // page filtering between Pro app and Team app.
          appType: "enterprise",
        },
      }),
    ]);

    logger.info(`Subscription activated for user ${userId}, plan ${planId}`);
  }

  async _handleInvoicePaid(invoice) {
    if (invoice.subscription) {
      const sub = await prisma.subscription.findFirst({
        where: { paymentId: invoice.subscription },
      });
      if (sub) {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: "active", expiresAt },
        });
      }
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

    // CRITICAL: revoke paid access
    await downgradeUser(sub.userId);

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
