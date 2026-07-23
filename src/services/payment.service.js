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
const {
  grantTeamCredits,
  TEAM_CREDITS_PER_SEAT_MONTHLY,
  TEAM_CREDITS_PER_SEAT_YEARLY,
} = require("./aiCredit.service");

class PaymentService {
  async createCheckoutSession(userId, planId, urls = {}) {
    const stripe = getStripe();
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new AppError("Plan not found", 404, "NOT_FOUND");

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");

    // BUG-PAY-001: always reuse existing Stripe customer to avoid duplicates
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
    const mode =
      plan.price === 0
        ? "setup"
        : plan.duration === "monthly" || plan.duration === "yearly"
          ? "subscription"
          : "payment";
    const session = await stripe.checkout.sessions.create({
      mode,
      customer: customerId,
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
        `${baseUrl}/payment-return.html?redirect=%2Fsubscription%2Fsuccess&type=${
          plan.appType === "enterprise" ? "team" : "pro"
        }&app_context=${
          plan.appType === "enterprise" ? "team" : "pro"
        }&session_id={CHECKOUT_SESSION_ID}`,
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

    // Event-level idempotency (PAY-010): record this event id before dispatch.
    // Stripe delivers at-least-once and retries on any non-2xx/network error,
    // so the same event.id may arrive multiple times. The unique constraint on
    // (provider, eventId) means a redelivery (or a concurrent duplicate) hits
    // P2002 — we treat that as "already processed" and skip dispatch.
    try {
      await prisma.webhookEvent.create({
        data: { provider: "stripe", eventId: event.id, type: event.type },
      });
    } catch (err) {
      if (err.code === "P2002") {
        logger.info(`[Webhook] event ${event.id} already processed — skipping`);
        return { received: true };
      }
      // Any other DB error: log and acknowledge (Stripe must not retry-loop on
      // our infra issues; per-handler guards still protect against duplicates).
      logger.error(`[Webhook] idempotency record failed: ${err.message}`, {
        eventId: event.id,
      });
    }

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
        case "payment_method.attached":
          await this._dedupeAttachedPaymentMethod(event.data.object);
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

  /**
   * BUG-PAY-002 (Stripe cleanup): when a new card attaches to a customer,
   * detach strictly-OLDER duplicates that share the same card fingerprint.
   *
   * HARD SAFETY GUARDS — a pm is NEVER detached if ANY apply:
   *   • it IS the just-attached pm
   *   • it is the customer's invoice_settings.default_payment_method
   *   • it is the default_payment_method of ANY non-cancelled subscription
   *     (active / past_due / trialing / unpaid / incomplete / paused)
   *   • its fingerprint differs from the new pm
   *   • it is NOT strictly older than the new pm
   * When unsure, KEEP. Every detach is try/caught so it can never break
   * checkout/billing. Idempotent: re-delivery finds nothing left to detach.
   */
  async _dedupeAttachedPaymentMethod(pm) {
    try {
      const stripe = getStripe();
      const customerId =
        typeof pm.customer === "string" ? pm.customer : pm.customer?.id;
      const fingerprint = pm.card?.fingerprint;
      if (!customerId || !fingerprint) return;

      const protectedIds = new Set([pm.id]);

      const customer = await stripe.customers.retrieve(customerId);
      const customerDefault =
        customer?.invoice_settings?.default_payment_method ||
        customer?.default_source ||
        null;
      if (customerDefault)
        protectedIds.add(
          typeof customerDefault === "string"
            ? customerDefault
            : customerDefault.id,
        );

      // Protect the pm of every subscription that could still bill.
      // NOTE: not paginated (limit 100). Fine for now — no real user has 100+
      // subscriptions; if one ever does, older pages won't be inspected here.
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
      });
      for (const sub of subs.data) {
        if (["canceled", "incomplete_expired"].includes(sub.status)) continue;
        const dpm = sub.default_payment_method;
        if (dpm) protectedIds.add(typeof dpm === "string" ? dpm : dpm.id);
      }

      // NOTE: not paginated (limit 100). Same known limitation as above.
      const pmList = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
        limit: 100,
      });
      const newCreated = pm.created || 0;
      const toDetach = pmList.data.filter(
        (o) =>
          o.id !== pm.id &&
          o.card?.fingerprint === fingerprint &&
          (o.created || 0) < newCreated &&
          !protectedIds.has(o.id),
      );

      for (const dup of toDetach) {
        try {
          await stripe.paymentMethods.detach(dup.id);
          logger.info(
            `[PM-dedupe] detached ${dup.id} (fp ${fingerprint}) for ${customerId}`,
          );
        } catch (err) {
          logger.error(`[PM-dedupe] detach failed ${dup.id}: ${err.message}`);
        }
      }
    } catch (err) {
      // Never let dedupe break webhook processing.
      logger.error(`[PM-dedupe] handler error: ${err.message}`);
    }
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
    // Yearly plans get the full year upfront, resetting at the renewal date.
    await grantTeamCredits(userId, seats, plan, expiresAt).catch((err) =>
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

    // Flow add-on renewal: not tracked via the Subscription table (it lives
    // on User.flowAddonStripeSubId), so it needs its own branch here. The
    // initial subscribe invoice is already logged (different txnId) by
    // handleFlowAddonCheckoutWebhook / createFlowAddonCheckout — only log
    // recurring renewal cycles, not the first invoice.
    const addonUser = await prisma.user.findFirst({
      where: { flowAddonStripeSubId: invoice.subscription },
      select: { id: true },
    });
    if (addonUser) {
      if (invoice.billing_reason === "subscription_create") return;
      await prisma.transactionLog.create({
        data: {
          userId: addonUser.id,
          txnId: invoice.id,
          chargeId: invoice.payment_intent || invoice.id,
          amountCharged: invoice.amount_paid || 0,
          currency: invoice.currency || "usd",
          status: "success",
          paymentMethod: "card",
          appType: "individual",
          appContext: "pro",
          purchaseType: "flow_addon",
        },
      });
      logger.info(
        `[payment._handleInvoicePaid] Flow add-on renewed: user=${addonUser.id} invoice=${invoice.id}`,
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
      const credits = isYearly
        ? seats * TEAM_CREDITS_PER_SEAT_YEARLY
        : seats * TEAM_CREDITS_PER_SEAT_MONTHLY;

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
        proService.getSubscriptionPeriodEnd(subscription),
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

  async createSetupIntent(userId) {
    const stripe = getStripe();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");

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

    const intent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      metadata: { userId },
    });

    return { clientSecret: intent.client_secret };
  }

  async listPaymentMethods(userId) {
    const stripe = getStripe();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");

    if (!user.stripeCustomerId) {
      return { paymentMethods: [], defaultPaymentMethodId: null };
    }

    const [pmList, customer] = await Promise.all([
      stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: "card",
        // NOTE: not paginated. Fine for now — no real user has 100+ cards.
        // If a customer ever exceeds this, older pages won't be deduped here.
        limit: 100,
      }),
      stripe.customers.retrieve(user.stripeCustomerId),
    ]);

    const defaultPmId =
      customer?.invoice_settings?.default_payment_method ||
      customer?.default_source ||
      null;

    // BUG-PAY-002: Stripe attaches a NEW pm_… on every Checkout / SetupIntent,
    // so the same physical card shows up many times (same fingerprint, new id).
    // Dedupe for DISPLAY only: keep ONE pm per card fingerprint — the default
    // if it's in the group, else the most recently created. A pm with NO
    // fingerprint is always kept (never hide a real card).
    const byFingerprint = new Map();
    const noFingerprint = [];
    for (const pm of pmList.data) {
      const fp = pm.card?.fingerprint;
      if (!fp) {
        noFingerprint.push(pm);
        continue;
      }
      const existing = byFingerprint.get(fp);
      if (!existing) {
        byFingerprint.set(fp, pm);
        continue;
      }
      const existingIsDefault = existing.id === defaultPmId;
      const candidateIsDefault = pm.id === defaultPmId;
      let winner;
      if (candidateIsDefault && !existingIsDefault) winner = pm;
      else if (existingIsDefault && !candidateIsDefault) winner = existing;
      else winner = (pm.created || 0) > (existing.created || 0) ? pm : existing;
      byFingerprint.set(fp, winner);
    }
    const deduped = [...noFingerprint, ...byFingerprint.values()];

    const paymentMethods = deduped.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand || "unknown",
      last4: pm.card?.last4 || "****",
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
      isDefault: pm.id === defaultPmId,
    }));

    return { paymentMethods, defaultPaymentMethodId: defaultPmId };
  }

  // Proactive duplicate check for the custom card-entry form — called with a
  // fingerprint from a freshly-tokenized (not yet attached) PaymentMethod, so
  // the form can block the save before it ever becomes a real saved card.
  // Cards aren't stored in our DB, so this is a live Stripe lookup, same
  // pattern as listPaymentMethods above.
  // paymentMethodId is a freshly-tokenized, NOT YET ATTACHED PaymentMethod
  // (created client-side via stripe.createPaymentMethod). Its card.fingerprint
  // is never returned to the browser (Stripe.js omits it from publishable-key
  // responses) — it must be read back here, server-side, with the secret key.
  async checkDuplicateCard(userId, paymentMethodId) {
    const stripe = getStripe();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
    if (!user.stripeCustomerId) return { isDuplicate: false };

    const newPm = await stripe.paymentMethods.retrieve(paymentMethodId);
    const fingerprint = newPm.card?.fingerprint;
    if (!fingerprint) return { isDuplicate: false };

    const pmList = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: "card",
      limit: 100,
    });
    const match = pmList.data.find(
      (pm) => pm.card?.fingerprint === fingerprint,
    );
    if (!match) return { isDuplicate: false };
    return {
      isDuplicate: true,
      existingCard: { brand: match.card.brand, last4: match.card.last4 },
    };
  }

  async setDefaultCard(userId, paymentMethodId) {
    const stripe = getStripe();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
    if (!user.stripeCustomerId)
      throw new AppError("No payment methods on file", 400, "NO_CUSTOMER");

    // Verify this PM belongs to this customer before setting as default
    const pm = await stripe.paymentMethods
      .retrieve(paymentMethodId)
      .catch(() => null);
    if (!pm || pm.customer !== user.stripeCustomerId)
      throw new AppError("Payment method not found", 404, "NOT_FOUND");

    await stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    return { success: true };
  }

  async removeCard(userId, paymentMethodId, cancelRecurring = false) {
    const stripe = getStripe();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        stripeCustomerId: true,
        flowAddonStripeSubId: true,
        flowAddonStatus: true,
        flowAddonCurrentPeriodEnd: true,
      },
    });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
    if (!user.stripeCustomerId)
      throw new AppError("No payment methods on file", 400, "NO_CUSTOMER");

    // Verify this PM belongs to this customer
    const pm = await stripe.paymentMethods
      .retrieve(paymentMethodId)
      .catch(() => null);
    if (!pm || pm.customer !== user.stripeCustomerId)
      throw new AppError("Payment method not found", 404, "NOT_FOUND");

    // Check for active team subscription or flow addon
    const activeSub = await prisma.subscription.findFirst({
      where: { userId, status: { in: ["active", "past_due"] } },
      select: { paymentId: true, expiresAt: true },
    });
    const hasActiveFlowAddon = ["active", "past_due"].includes(
      user.flowAddonStatus,
    );

    if (activeSub || hasActiveFlowAddon) {
      const customer = await stripe.customers.retrieve(user.stripeCustomerId);
      const defaultPmId =
        customer?.invoice_settings?.default_payment_method ||
        customer?.default_source ||
        null;

      if (defaultPmId === paymentMethodId) {
        if (!cancelRecurring) {
          // Return expiry info so frontend can show confirmation modal
          const err = new AppError(
            "Removing this card will cancel auto-renewal on your active subscription(s). Your plan stays active until the current billing period ends.",
            400,
            "DEFAULT_CARD_ACTIVE_SUB",
          );
          err.subscriptionExpiry = activeSub?.expiresAt || null;
          err.flowAddonExpiry = user.flowAddonCurrentPeriodEnd || null;
          throw err;
        }

        // cancelRecurring=true: cancel at period end then detach
        if (activeSub?.paymentId) {
          await stripe.subscriptions.update(activeSub.paymentId, {
            cancel_at_period_end: true,
          });
          await prisma.subscription.updateMany({
            where: { userId, status: { in: ["active", "past_due"] } },
            data: { status: "cancelling" },
          });
        }
        if (hasActiveFlowAddon && user.flowAddonStripeSubId) {
          await stripe.subscriptions.update(user.flowAddonStripeSubId, {
            cancel_at_period_end: true,
          });
          await prisma.user.update({
            where: { id: userId },
            data: { flowAddonStatus: "cancelling" },
          });
        }
      }
    }

    await stripe.paymentMethods.detach(paymentMethodId);
    return { success: true };
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
