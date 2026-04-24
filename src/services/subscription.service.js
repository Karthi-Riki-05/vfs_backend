const { prisma } = require("../lib/prisma");
const { getStripe, getStripeCurrency } = require("../lib/stripe");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

// Pricing: per user per period (in smallest currency unit, e.g. cents)
const PRICING = {
  monthly: { perUser: 100 }, // $1.00/user/month
  yearly: { perUser: 720 }, // $7.20/user/year (80% off $36)
};

class SubscriptionService {
  /**
   * Returns the Stripe Price ID for the given plan type.
   * Falls back to price_data if env vars are not set.
   */
  _getPriceId(plan) {
    const val = (envVar) => {
      const v = process.env[envVar];
      return v && v !== "placeholder" ? v : null;
    };
    if (plan === "monthly") {
      return (
        val("STRIPE_TEAM_MONTHLY_PRICE") ||
        val("STRIPE_MONTHLY_PRICE_ID") ||
        null
      );
    }
    if (plan === "yearly") {
      return (
        val("STRIPE_TEAM_YEARLY_PRICE") || val("STRIPE_YEARLY_PRICE_ID") || null
      );
    }
    return null;
  }

  async getOrCreateStripeCustomer(stripe, user) {
    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || undefined,
      metadata: { userId: user.id },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  async createCheckoutSession(userId, { plan, teamMembers }) {
    const stripe = getStripe();

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");

    // Check if user already has an active Stripe subscription
    const existingSub = await prisma.subscription.findUnique({
      where: { userId },
    });
    if (
      existingSub &&
      existingSub.status === "active" &&
      existingSub.paymentId
    ) {
      throw new AppError(
        "You already have an active subscription. Use change plan instead.",
        400,
        "ALREADY_SUBSCRIBED",
      );
    }

    const customerId = await this.getOrCreateStripeCustomer(stripe, user);

    const priceId = this._getPriceId(plan);
    const baseUrl = process.env.APP_URL || "http://localhost:3000";

    const lineItem = priceId
      ? { price: priceId, quantity: teamMembers }
      : {
          price_data: {
            currency: getStripeCurrency(),
            product: process.env.STRIPE_PRODUCT_ID || undefined,
            product_data: process.env.STRIPE_PRODUCT_ID
              ? undefined
              : {
                  name: `Value Charts ${plan === "yearly" ? "Yearly" : "Monthly"} Plan`,
                  description: `${teamMembers} team members`,
                },
            unit_amount: PRICING[plan].perUser,
            recurring: { interval: plan === "yearly" ? "year" : "month" },
          },
          quantity: teamMembers,
        };

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [lineItem],
      metadata: { userId, plan, teamMembers: String(teamMembers) },
      subscription_data: {
        metadata: { userId, plan, teamMembers: String(teamMembers) },
      },
      // Stripe Adaptive Pricing (account-level setting) converts to local currency
      success_url: `${baseUrl}/dashboard/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/dashboard/subscription`,
    });

    return { sessionId: session.id, url: session.url };
  }

  async getStatus(userId) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    // Build scheduledChange regardless of subscription status
    let scheduledChange = null;
    if (subscription && subscription.scheduledPlanType) {
      scheduledChange = {
        plan: subscription.scheduledPlanType,
        teamMembers: subscription.scheduledTeamMembers,
        activationDate: subscription.scheduledActivationDate,
      };
    }

    if (!subscription || subscription.status === "cancelled") {
      return {
        hasSubscription: false,
        plan: null,
        status: null,
        teamMemberLimit: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        scheduledChange,
      };
    }

    // Determine plan type from productType or plan name
    let planType = null;
    if (subscription.productType) {
      planType = subscription.productType.includes("yearly")
        ? "yearly"
        : "monthly";
    } else if (subscription.plan?.duration) {
      planType = subscription.plan.duration;
    }

    return {
      hasSubscription: true,
      plan: planType,
      status: subscription.status,
      teamMemberLimit: subscription.usersCount || 5,
      currentPeriodEnd: subscription.expiresAt,
      cancelAtPeriodEnd: subscription.status === "cancelling",
      planName: subscription.plan?.name || null,
      price: subscription.price,
      scheduledChange,
    };
  }

  async cancelSubscription(userId) {
    const stripe = getStripe();

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });
    if (!subscription)
      throw new AppError("No active subscription found", 404, "NOT_FOUND");
    if (!subscription.paymentId)
      throw new AppError(
        "No Stripe subscription to cancel",
        400,
        "NO_STRIPE_SUB",
      );

    await stripe.subscriptions.update(subscription.paymentId, {
      cancel_at_period_end: true,
    });

    await prisma.subscription.update({
      where: { userId },
      data: { status: "cancelling" },
    });

    logger.info(`Subscription cancel scheduled for user ${userId}`);
    return {
      message: "Subscription will be cancelled at end of billing period",
    };
  }

  async changePlan(userId, { plan, teamMembers }) {
    const stripe = getStripe();

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });
    if (!subscription || !subscription.paymentId) {
      throw new AppError("No active subscription found", 404, "NOT_FOUND");
    }

    // Determine current plan type
    let currentPlan = null;
    if (subscription.productType) {
      currentPlan = subscription.productType.includes("yearly")
        ? "yearly"
        : "monthly";
    }

    // Case 1: Yearly → Monthly — block downgrade
    if (currentPlan === "yearly" && plan === "monthly") {
      throw new AppError(
        "Downgrading from yearly to monthly is not available. Your yearly plan will continue until it expires.",
        400,
        "DOWNGRADE_NOT_ALLOWED",
      );
    }

    // Case 2: Same plan type, different member count — update quantity in Stripe
    if (currentPlan === plan) {
      const stripeSub = await stripe.subscriptions.retrieve(
        subscription.paymentId,
      );
      const subItem = stripeSub.items.data[0];

      await stripe.subscriptions.update(subscription.paymentId, {
        items: [
          {
            id: subItem.id,
            quantity: teamMembers,
          },
        ],
        metadata: { userId, plan, teamMembers: String(teamMembers) },
        proration_behavior: "create_prorations",
      });

      const price = (teamMembers * PRICING[plan].perUser) / 100;
      await prisma.subscription.update({
        where: { userId },
        data: {
          usersCount: teamMembers,
          price,
        },
      });

      logger.info(
        `Member count changed for user ${userId}: ${plan}, ${teamMembers} members`,
      );
      return {
        type: "updated",
        message: "Team member count updated successfully",
      };
    }

    // Case 3: Monthly → Yearly — schedule the change for period end
    if (currentPlan === "monthly" && plan === "yearly") {
      const activationDate = subscription.expiresAt || new Date();

      await prisma.subscription.update({
        where: { userId },
        data: {
          scheduledPlanType: plan,
          scheduledTeamMembers: teamMembers,
          scheduledActivationDate: activationDate,
        },
      });

      logger.info(
        `Plan change scheduled for user ${userId}: monthly → yearly at ${activationDate.toISOString()}`,
      );
      return {
        type: "scheduled",
        message: "Your plan change to yearly has been scheduled.",
        scheduledChange: {
          plan,
          teamMembers,
          activationDate,
        },
      };
    }

    throw new AppError("Invalid plan change", 400, "INVALID_CHANGE");
  }

  async activateScheduledPlan(userId) {
    const stripe = getStripe();

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (!subscription)
      throw new AppError("No subscription found", 404, "NOT_FOUND");
    if (!subscription.scheduledPlanType) {
      throw new AppError(
        "No scheduled plan change found",
        400,
        "NO_SCHEDULED_CHANGE",
      );
    }

    const plan = subscription.scheduledPlanType;
    const teamMembers = subscription.scheduledTeamMembers || 5;

    // Cancel current Stripe subscription immediately
    if (subscription.paymentId) {
      try {
        await stripe.subscriptions.cancel(subscription.paymentId);
      } catch (err) {
        logger.warn(
          `Failed to cancel old Stripe sub ${subscription.paymentId}: ${err.message}`,
        );
      }
    }

    // Clear scheduled fields
    await prisma.subscription.update({
      where: { userId },
      data: {
        scheduledPlanType: null,
        scheduledTeamMembers: null,
        scheduledActivationDate: null,
        paymentId: null,
        status: "pending_activation",
      },
    });

    // Create new checkout session for the scheduled plan
    const result = await this.createCheckoutSession(userId, {
      plan,
      teamMembers,
    });

    logger.info(
      `Scheduled plan activated for user ${userId}: creating checkout for ${plan}`,
    );
    return result;
  }

  async cancelScheduledChange(userId) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });
    if (!subscription)
      throw new AppError("No subscription found", 404, "NOT_FOUND");
    if (!subscription.scheduledPlanType) {
      throw new AppError(
        "No scheduled plan change found",
        400,
        "NO_SCHEDULED_CHANGE",
      );
    }

    await prisma.subscription.update({
      where: { userId },
      data: {
        scheduledPlanType: null,
        scheduledTeamMembers: null,
        scheduledActivationDate: null,
      },
    });

    logger.info(`Scheduled plan change cancelled for user ${userId}`);
    return { message: "Scheduled plan change cancelled" };
  }

  async handleWebhook(rawBody, signature) {
    const stripe = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret)
      throw new AppError("Webhook secret not configured", 503, "CONFIG_ERROR");

    logger.info("=== SUBSCRIPTION WEBHOOK RECEIVED ===");
    logger.info(`Signature present: ${!!signature}`);
    logger.info(
      `Body type: ${typeof rawBody}, isBuffer: ${Buffer.isBuffer(rawBody)}`,
    );

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      logger.error("Stripe webhook signature verification FAILED", {
        error: err.message,
      });
      throw new AppError("Invalid webhook signature", 400, "INVALID_SIGNATURE");
    }

    logger.info(`Stripe subscription webhook verified: ${event.type}`, {
      eventId: event.id,
    });

    try {
      console.log("[Webhook][subscription.service]", event.type, "received");
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
        default:
          logger.info(`Unhandled subscription webhook event: ${event.type}`);
      }
    } catch (err) {
      // Log but still return 200 so Stripe doesn't retry endlessly
      logger.error(`Webhook processing error for ${event.type}:`, err);
    }

    return { received: true };
  }

  async _handleCheckoutComplete(session) {
    const { userId, plan, teamMembers, purchaseType } = session.metadata || {};
    logger.info("=== CHECKOUT SESSION COMPLETED ===");
    logger.info(`Session ID: ${session.id}, Customer: ${session.customer}`);
    logger.info(
      `Subscription: ${session.subscription}, Metadata: ${JSON.stringify(session.metadata)}`,
    );

    // Guard: skip pro / addon purchases — handled by payment.service.js → pro.service.js
    if (
      purchaseType === "pro_upgrade" ||
      purchaseType === "pro_extra_flows" ||
      purchaseType === "ai_addon_credits"
    ) {
      console.log(
        "[Webhook][subscription.service] checkout.session.completed skipped — purchaseType:",
        purchaseType,
      );
      return;
    }

    if (!userId || !plan) {
      logger.error(
        "Missing userId or plan in session metadata — cannot save subscription",
      );
      return;
    }

    const members = parseInt(teamMembers, 10) || 5;
    const pricing = PRICING[plan];
    const price = (members * pricing.perUser) / 100;

    const expiresAt = new Date();
    if (plan === "yearly") {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    // Find or create a plan record for this
    let dbPlan = await prisma.plan.findFirst({
      where: { name: plan === "yearly" ? "Team Yearly" : "Team Monthly" },
    });
    if (!dbPlan) {
      dbPlan = await prisma.plan.create({
        data: {
          name: plan === "yearly" ? "Team Yearly" : "Team Monthly",
          duration: plan,
          price,
          status: "active",
          tier: 2,
          appType: "enterprise",
          userAccess: true,
          userCount: members,
          features: JSON.stringify([
            "Unlimited flows",
            "All shapes",
            "Export all formats",
            "Team collaboration",
            "Admin dashboard",
            "Team management",
            "Priority support",
            "AI diagram generation",
          ]),
        },
      });
    }

    // Archive the previous subscription (if any) before we overwrite it,
    // so the user / admin can review their subscription history.
    const existingSub = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });
    const archiveOps = existingSub
      ? [
          prisma.subscriptionHistory.create({
            data: {
              userId,
              planName: existingSub.plan?.name || null,
              productType: existingSub.productType || null,
              status: existingSub.status,
              price: existingSub.price,
              currency: existingSub.currency,
              isRecurring: existingSub.isRecurring,
              source: existingSub.isRecurring ? "stripe" : "admin",
              startedAt: existingSub.startedAt,
              expiresAt: existingSub.expiresAt,
              archivedReason: "replaced_by_stripe",
              stripePaymentId: existingSub.paymentId,
              snapshot: {
                id: existingSub.id,
                planId: existingSub.planId,
                usersCount: existingSub.usersCount,
                appType: existingSub.appType,
                createdAt: existingSub.createdAt,
                updatedAt: existingSub.updatedAt,
              },
            },
          }),
        ]
      : [];

    await prisma.$transaction([
      ...archiveOps,
      prisma.subscription.upsert({
        where: { userId },
        update: {
          planId: dbPlan.id,
          status: "active",
          paymentId: session.subscription || session.payment_intent,
          price,
          usersCount: members,
          productType: plan === "yearly" ? "team_yearly" : "team_monthly",
          startedAt: new Date(),
          expiresAt,
          appType: "enterprise",
          // Clear any scheduled change on successful checkout
          scheduledPlanType: null,
          scheduledTeamMembers: null,
          scheduledActivationDate: null,
        },
        create: {
          userId,
          planId: dbPlan.id,
          status: "active",
          paymentId: session.subscription || session.payment_intent,
          price,
          usersCount: members,
          productType: plan === "yearly" ? "team_yearly" : "team_monthly",
          startedAt: new Date(),
          expiresAt,
          appType: "enterprise",
        },
      }),
      // Flip the user onto the team tier so hasPro / currentVersion gates
      // (dashboard, flow-limit checks, AI pipeline) pick it up.
      prisma.user.update({
        where: { id: userId },
        data: {
          hasPro: true,
          currentVersion: "team",
          proPurchasedAt: new Date(),
        },
      }),
      // Grant team-tier AI credits (300/mo) scoped to team appContext.
      prisma.aiCreditBalance.upsert({
        where: { userId },
        create: {
          userId,
          planCredits: 300,
          addonCredits: 0,
          planResetsAt: expiresAt,
          appContext: "team",
        },
        update: {
          planCredits: 300,
          planResetsAt: expiresAt,
          appContext: "team",
        },
      }),
      // Migrate the user's existing flows into the new team workspace so
      // they don't "disappear" after upgrade. Only migrates their own
      // non-deleted flows that are still in the previous free context.
      prisma.flow.updateMany({
        where: { ownerId: userId, appContext: "free", deletedAt: null },
        data: { appContext: "team" },
      }),
      prisma.transactionLog.create({
        data: {
          chargeId: session.payment_intent || session.id,
          txnId: session.id,
          amountCharged: session.amount_total || 0,
          currency: session.currency || getStripeCurrency(),
          status: "success",
          paymentMethod: session.payment_method_types?.[0] || "card",
        },
      }),
    ]);

    logger.info(
      `Subscription activated for user ${userId}: ${plan}, ${members} members`,
    );
  }

  _isTeamSub(sub) {
    return (
      sub &&
      typeof sub.productType === "string" &&
      sub.productType.startsWith("team_")
    );
  }

  async _handleInvoicePaid(invoice) {
    logger.info(`=== INVOICE PAID === subscription: ${invoice.subscription}`);
    if (!invoice.subscription) return;

    const sub = await prisma.subscription.findFirst({
      where: { paymentId: invoice.subscription },
    });
    if (!sub) {
      logger.warn(
        `No subscription found for paymentId: ${invoice.subscription}`,
      );
      return;
    }
    if (!this._isTeamSub(sub)) {
      console.log(
        "[Webhook][subscription.service] invoice.paid skipped — not a team subscription:",
        sub.productType,
      );
      return;
    }

    const expiresAt = new Date();
    if (sub.productType === "team_yearly") {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "active", expiresAt },
    });

    logger.info(
      `Subscription renewed for user ${sub.userId}. New expiry: ${expiresAt.toISOString()}`,
    );
  }

  async _handlePaymentFailed(invoice) {
    logger.warn(
      `=== PAYMENT FAILED === invoice: ${invoice.id}, subscription: ${invoice.subscription}`,
    );
    if (!invoice.subscription) return;

    const sub = await prisma.subscription.findFirst({
      where: { paymentId: invoice.subscription },
    });
    if (sub && this._isTeamSub(sub)) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "past_due" },
      });
      logger.warn(
        `Subscription ${sub.id} marked as past_due for user ${sub.userId}`,
      );
    } else if (sub) {
      console.log(
        "[Webhook][subscription.service] invoice.payment_failed skipped — not a team subscription:",
        sub.productType,
      );
    }
  }

  async _handleSubscriptionUpdated(subscription) {
    logger.info(
      `=== SUBSCRIPTION UPDATED === id: ${subscription.id}, status: ${subscription.status}`,
    );

    const sub = await prisma.subscription.findFirst({
      where: { paymentId: subscription.id },
    });
    if (!sub) {
      logger.warn(`No subscription found for paymentId: ${subscription.id}`);
      return;
    }
    if (!this._isTeamSub(sub)) {
      console.log(
        "[Webhook][subscription.service] customer.subscription.updated skipped — not a team subscription:",
        sub.productType,
      );
      return;
    }

    const updateData = {
      status:
        subscription.status === "canceled" ? "cancelled" : subscription.status,
    };

    if (subscription.current_period_end) {
      updateData.expiresAt = new Date(subscription.current_period_end * 1000);
    }
    if (subscription.current_period_start) {
      updateData.startedAt = new Date(subscription.current_period_start * 1000);
    }

    await prisma.subscription.update({
      where: { id: sub.id },
      data: updateData,
    });

    logger.info(`Subscription ${sub.id} updated: status=${updateData.status}`);
  }

  async _handleSubscriptionDeleted(subscription) {
    logger.info(`=== SUBSCRIPTION DELETED === id: ${subscription.id}`);

    const sub = await prisma.subscription.findFirst({
      where: { paymentId: subscription.id },
    });
    if (sub && this._isTeamSub(sub)) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "cancelled" },
      });
      logger.info(`Subscription cancelled for user ${sub.userId}`);
    } else if (sub) {
      console.log(
        "[Webhook][subscription.service] customer.subscription.deleted skipped — not a team subscription:",
        sub.productType,
      );
    }
  }

  async reactivateSubscription(userId) {
    const stripe = getStripe();

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });
    if (!subscription)
      throw new AppError("No subscription found", 404, "NOT_FOUND");
    if (!subscription.paymentId)
      throw new AppError(
        "No Stripe subscription to reactivate",
        400,
        "NO_STRIPE_SUB",
      );
    if (subscription.status !== "cancelling") {
      throw new AppError(
        "Subscription is not in cancelling state",
        400,
        "NOT_CANCELLING",
      );
    }

    await stripe.subscriptions.update(subscription.paymentId, {
      cancel_at_period_end: false,
    });

    await prisma.subscription.update({
      where: { userId },
      data: { status: "active" },
    });

    logger.info(`Subscription reactivated for user ${userId}`);
    return { message: "Subscription reactivated successfully" };
  }

  async verifySession(userId, sessionId) {
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    logger.info(
      `Verify session ${sessionId}: status=${session.status}, payment=${session.payment_status}`,
    );

    if (session.payment_status !== "paid") {
      throw new AppError("Payment not completed", 400, "PAYMENT_NOT_COMPLETE");
    }

    // Check metadata matches user
    if (session.metadata?.userId && session.metadata.userId !== userId) {
      throw new AppError(
        "Session does not belong to this user",
        403,
        "FORBIDDEN",
      );
    }

    // Check if subscription already exists (webhook may have already saved it)
    const existing = await prisma.subscription.findUnique({
      where: { userId },
    });
    if (existing && existing.status === "active" && existing.paymentId) {
      logger.info(
        `Subscription already exists for user ${userId}, returning status`,
      );
      return this.getStatus(userId);
    }

    // Webhook hasn't fired yet — save the subscription now
    const { plan, teamMembers } = session.metadata || {};
    if (!plan) {
      throw new AppError(
        "Missing plan in session metadata",
        400,
        "INVALID_SESSION",
      );
    }

    // Reuse the same logic as _handleCheckoutComplete
    await this._handleCheckoutComplete(session);

    return this.getStatus(userId);
  }

  // --- Legacy methods kept for backward compat ---
  async getCurrentSubscription(userId) {
    return await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });
  }

  async getPlans() {
    return await prisma.plan.findMany({
      orderBy: { tier: "asc" },
    });
  }

  async subscribeToPlan(userId, planId) {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    return await prisma.subscription.upsert({
      where: { userId },
      update: {
        planId,
        status: "active",
        expiresAt,
      },
      create: {
        userId,
        planId,
        status: "active",
        expiresAt,
      },
    });
  }
}

module.exports = new SubscriptionService();
