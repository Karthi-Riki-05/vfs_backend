const { prisma } = require("../lib/prisma");
const { getStripe, getStripeCurrency } = require("../lib/stripe");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const { sendEmail, emailTemplates } = require("../utils/email");

// Pricing: per user per period (in smallest currency unit, e.g. cents)
const PRICING = {
  monthly: { perUser: 100 }, // $1.00/user/month
  yearly: { perUser: 720 }, // $7.20/user/year (80% off $36)
};

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

  /**
   * Resolves a Stripe Price ID for the canonical pricing of `plan`. If
   * env has one, use it. Otherwise look it up in Stripe by metadata
   * tag (vc_canonical_<plan>_<unitAmount>) and create one if missing.
   * The result is memoised on the service instance so repeated calls
   * within a process don't keep hitting Stripe.
   */
  async _ensureCanonicalPriceId(plan) {
    const fromEnv = this._getPriceId(plan);
    if (fromEnv) return fromEnv;

    this._priceCache = this._priceCache || {};
    const cacheKey = `${plan}:${PRICING[plan].perUser}`;
    if (this._priceCache[cacheKey]) return this._priceCache[cacheKey];

    const stripe = getStripe();
    const tag = `vc_canonical_${plan}_${PRICING[plan].perUser}`;

    // 1. Try to find an existing Price tagged with our metadata.
    try {
      const search = await stripe.prices.search({
        query: `metadata['vc_tag']:'${tag}' AND active:'true'`,
        limit: 1,
      });
      if (search.data?.[0]) {
        this._priceCache[cacheKey] = search.data[0].id;
        return search.data[0].id;
      }
    } catch (err) {
      logger.warn(
        `[ensurePrice] Stripe search failed (${err.message}); will create new Price.`,
      );
    }

    // 2. Resolve a Product to attach the Price to.
    let productId = process.env.STRIPE_PRODUCT_ID || null;
    if (!productId) {
      const product = await stripe.products.create({
        name: `Value Charts Team Plan (${plan})`,
        metadata: { vc_canonical: "true", vc_plan: plan },
      });
      productId = product.id;
    }

    // 3. Create the Price.
    const price = await stripe.prices.create({
      currency: getStripeCurrency(),
      product: productId,
      unit_amount: PRICING[plan].perUser,
      recurring: { interval: plan === "yearly" ? "year" : "month" },
      metadata: { vc_tag: tag, vc_plan: plan },
    });
    this._priceCache[cacheKey] = price.id;
    logger.info(
      `[ensurePrice] Created canonical Stripe Price ${price.id} for ${plan} (${PRICING[plan].perUser} cents)`,
    );
    return price.id;
  }

  /**
   * Build the Stripe subscription-item payload for the canonical per-seat
   * price ($1/month or $7.20/year). Used by changePlan to migrate legacy
   * subscriptions onto the current pricing whenever seats are adjusted.
   *
   * Prefers a Stripe Price ID from env (STRIPE_TEAM_*_PRICE) so prices stay
   * managed in the dashboard; otherwise falls back to inline price_data
   * with our PRICING constants.
   */
  _buildItemForPlan(itemId, plan, quantity) {
    const priceId = this._getPriceId(plan);
    if (priceId) {
      return { id: itemId, price: priceId, quantity };
    }
    return {
      id: itemId,
      price_data: {
        currency: getStripeCurrency(),
        product: process.env.STRIPE_PRODUCT_ID || undefined,
        product_data: process.env.STRIPE_PRODUCT_ID
          ? undefined
          : {
              name: `Value Charts ${plan === "yearly" ? "Yearly" : "Monthly"} Plan`,
              description: "Per-seat team plan",
            },
        unit_amount: PRICING[plan].perUser,
        recurring: { interval: plan === "yearly" ? "year" : "month" },
      },
      quantity,
    };
  }

  /**
   * Returns true if the given Stripe sub item's per-seat amount differs
   * from our canonical PRICING for that plan. Used to decide whether the
   * subscription needs a one-time price migration.
   */
  _itemPriceIsStale(subItem, plan) {
    const expected = PRICING[plan].perUser;
    const current =
      subItem?.price?.unit_amount ?? subItem?.plan?.amount ?? null;
    if (current == null) return true;
    return current !== expected;
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
    // If there's no Stripe subscription on file (manually-granted row, or
    // old Stripe sub was deleted), fall through to a fresh checkout instead
    // of 404'ing. The UI flow ("Change Plan" button) reaches us here when
    // status=active but paymentId is null — treat that as a new purchase.
    if (!subscription || !subscription.paymentId) {
      const checkout = await this.createCheckoutSession(userId, {
        plan,
        teamMembers,
      });
      return {
        type: "checkout",
        message: "Redirecting to checkout to set up your plan",
        ...checkout,
      };
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
      const currentQuantity = subItem.quantity || subscription.usersCount || 0;
      const isAddingSeats = teamMembers > currentQuantity;
      const isReducingSeats = teamMembers < currentQuantity;
      const priceIsStale = this._itemPriceIsStale(subItem, plan);

      if (teamMembers === currentQuantity && !priceIsStale) {
        return {
          type: "noop",
          message: "Member count unchanged",
        };
      }
      // If only the price is stale (quantity unchanged), treat as a price
      // migration: re-bill on the canonical Price with no immediate charge,
      // and let Stripe credit/debit the difference at next renewal.
      if (teamMembers === currentQuantity && priceIsStale) {
        await stripe.subscriptions.update(subscription.paymentId, {
          items: [this._buildItemForPlan(subItem.id, plan, teamMembers)],
          metadata: { userId, plan, teamMembers: String(teamMembers) },
          proration_behavior: "none",
        });
        const newPrice = (teamMembers * PRICING[plan].perUser) / 100;
        await prisma.subscription.update({
          where: { userId },
          data: { price: newPrice },
        });
        logger.info(
          `[changePlan] Migrated user ${userId} to canonical ${plan} price (${teamMembers} seats, no proration)`,
        );
        return {
          type: "updated",
          message: "Subscription migrated to current pricing.",
        };
      }

      // ADD seats → redirect the user to a Stripe-hosted "Confirm
      // subscription update" page. They see the prorated charge, the
      // current and new plan, and click "Confirm". Stripe handles the
      // payment, then redirects back to our app. The webhook updates our
      // local DB once the change is confirmed.
      if (isAddingSeats) {
        const customerId = stripeSub.customer;
        const baseUrl =
          process.env.NEXTAUTH_URL ||
          process.env.APP_URL ||
          "http://localhost:3002";

        // Resolve (or auto-create) a real Stripe Price ID for the canonical
        // pricing — the portal subscription_update_confirm flow REQUIRES
        // a Price ID, it does not accept inline price_data.
        let canonicalPriceId;
        try {
          canonicalPriceId = await this._ensureCanonicalPriceId(plan);
        } catch (err) {
          logger.error(
            `[changePlan] Could not resolve canonical Price for ${plan}: ${err.message}`,
          );
        }

        try {
          if (!canonicalPriceId) throw new Error("No canonical Price ID");
          const portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${baseUrl}/dashboard/subscription?upgrade=confirmed`,
            flow_data: {
              type: "subscription_update_confirm",
              subscription_update_confirm: {
                subscription: subscription.paymentId,
                items: [
                  {
                    id: subItem.id,
                    price: canonicalPriceId,
                    quantity: teamMembers,
                  },
                ],
              },
              after_completion: {
                type: "redirect",
                redirect: {
                  return_url: `${baseUrl}/dashboard/subscription?upgrade=confirmed`,
                },
              },
            },
          });

          logger.info(
            `[changePlan] Created subscription_update_confirm portal session for user ${userId} with price=${canonicalPriceId}`,
          );

          return {
            type: "confirm_in_stripe",
            message:
              "Redirecting to Stripe to confirm the seat upgrade and payment.",
            url: portalSession.url,
          };
        } catch (portalErr) {
          // The portal flow requires a Stripe Price ID (not inline
          // price_data). If we don't have one configured, fall back to the
          // off-session charge path so the user still gets the upgrade.
          logger.warn(
            `[changePlan] Portal subscription_update_confirm unavailable (${portalErr.message}). Falling back to off-session charge.`,
          );
          return await this._upgradeSeatsOffSession({
            stripe,
            subscription,
            stripeSub,
            subItem,
            plan,
            teamMembers,
            currentQuantity,
            userId,
          });
        }
      } else if (isReducingSeats) {
        // REDUCE seats → no immediate charge. Stripe issues a prorated
        // credit applied to the next invoice (standard SaaS behaviour).
        // Also swap to the canonical Price so legacy subs migrate.
        await stripe.subscriptions.update(subscription.paymentId, {
          items: [this._buildItemForPlan(subItem.id, plan, teamMembers)],
          metadata: {
            userId,
            plan,
            teamMembers: String(teamMembers),
          },
          proration_behavior: "create_prorations",
        });
      }

      const price = (teamMembers * PRICING[plan].perUser) / 100;
      await prisma.subscription.update({
        where: { userId },
        data: {
          usersCount: teamMembers,
          price,
        },
      });

      logger.info(
        `Member count changed for user ${userId}: ${plan}, ${currentQuantity} → ${teamMembers} (${isAddingSeats ? "charged immediately" : "credit on next invoice"})`,
      );
      return {
        type: "updated",
        message: isAddingSeats
          ? "Seats added — your card was charged the prorated amount."
          : "Seats reduced — a prorated credit will apply to your next invoice.",
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

  /**
   * Cron-driven activation: finds subscriptions whose scheduledActivationDate
   * has arrived and creates the new Stripe subscription off-session using the
   * customer's saved payment method. Used to fulfil Case 2 (Monthly→Yearly)
   * automatically when the current period ends.
   *
   * Returns a summary { processed, activated, failed }.
   */
  async runScheduledActivations() {
    const stripe = getStripe();
    const now = new Date();

    const due = await prisma.subscription.findMany({
      where: {
        scheduledPlanType: { not: null },
        scheduledActivationDate: { lte: now },
      },
      include: { user: true },
    });

    let activated = 0;
    let failed = 0;

    for (const sub of due) {
      const userId = sub.userId;
      const plan = sub.scheduledPlanType;
      const teamMembers = sub.scheduledTeamMembers || sub.usersCount || 5;

      try {
        // 1. Cancel the current Stripe subscription (period has ended).
        if (sub.paymentId) {
          try {
            await stripe.subscriptions.cancel(sub.paymentId);
          } catch (err) {
            logger.warn(
              `[Cron] Failed to cancel old Stripe sub ${sub.paymentId}: ${err.message}`,
            );
          }
        }

        // 2. Resolve the customer + their default payment method.
        const customerId = sub.user?.stripeCustomerId;
        if (!customerId) {
          throw new Error("User has no Stripe customer on file");
        }
        const customer = await stripe.customers.retrieve(customerId);
        const defaultPm =
          customer.invoice_settings?.default_payment_method ||
          customer.default_source ||
          null;
        if (!defaultPm) {
          throw new Error(
            "Customer has no default payment method — cannot auto-charge",
          );
        }

        // 3. Build the line item for the new plan (same shape as createCheckoutSession).
        const priceId = this._getPriceId(plan);
        const item = priceId
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

        // 4. Create the new subscription off-session — Stripe charges the saved card.
        const newSub = await stripe.subscriptions.create({
          customer: customerId,
          items: [item],
          default_payment_method: defaultPm,
          off_session: true,
          payment_behavior: "error_if_incomplete",
          metadata: {
            userId,
            plan,
            teamMembers: String(teamMembers),
            activatedFromSchedule: "true",
          },
        });

        // 5. Update local record.
        const expiresAt = new Date();
        if (plan === "yearly")
          expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        else expiresAt.setMonth(expiresAt.getMonth() + 1);

        await prisma.subscription.update({
          where: { userId },
          data: {
            paymentId: newSub.id,
            status: "active",
            usersCount: teamMembers,
            productType: plan === "yearly" ? "team_yearly" : "team_monthly",
            price: (teamMembers * PRICING[plan].perUser) / 100,
            expiresAt,
            scheduledPlanType: null,
            scheduledTeamMembers: null,
            scheduledActivationDate: null,
          },
        });

        activated += 1;
        logger.info(
          `[Cron] Activated scheduled ${plan} plan for user ${userId} (${teamMembers} seats)`,
        );
      } catch (err) {
        failed += 1;
        logger.error(
          `[Cron] Failed to activate scheduled plan for user ${userId}: ${err.message}`,
        );
        // Leave scheduled fields in place so the next run retries; flip status
        // so admins/users see something needs attention.
        await prisma.subscription
          .update({
            where: { userId },
            data: { status: "activation_failed" },
          })
          .catch(() => {});
      }
    }

    return { processed: due.length, activated, failed };
  }

  /**
   * Fallback for adding seats when the Stripe billing portal
   * subscription_update_confirm flow is unavailable (e.g. inline
   * price_data is in use because no Price ID is configured in env).
   * Off-session charge using the customer's saved card.
   */
  async _upgradeSeatsOffSession({
    stripe,
    subscription,
    stripeSub,
    subItem,
    plan,
    teamMembers,
    currentQuantity,
    userId,
  }) {
    const customerId = stripeSub.customer;
    const customer = await stripe.customers.retrieve(customerId);
    let defaultPm =
      customer.invoice_settings?.default_payment_method ||
      customer.default_source ||
      null;

    if (!defaultPm) {
      const pmList = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
        limit: 10,
      });
      const candidate = pmList.data?.[0];
      if (candidate) {
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: candidate.id },
        });
        defaultPm = candidate.id;
      }
    }

    if (!defaultPm) {
      const baseUrl =
        process.env.NEXTAUTH_URL ||
        process.env.APP_URL ||
        "http://localhost:3002";
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${baseUrl}/dashboard/subscription`,
      });
      return {
        type: "needs_payment_method",
        message:
          "No payment method on file. Add a card in the billing portal, then return here and try again.",
        url: portalSession.url,
      };
    }

    let updatedSub;
    try {
      updatedSub = await stripe.subscriptions.update(subscription.paymentId, {
        items: [this._buildItemForPlan(subItem.id, plan, teamMembers)],
        metadata: { userId, plan, teamMembers: String(teamMembers) },
        proration_behavior: "always_invoice",
        default_payment_method: defaultPm,
      });
    } catch (err) {
      throw new AppError(
        err.message || "Payment failed — seat increase was not applied.",
        402,
        "PAYMENT_REQUIRED",
      );
    }

    const rollback = async (reason) => {
      try {
        await stripe.subscriptions.update(subscription.paymentId, {
          items: [{ id: subItem.id, quantity: currentQuantity }],
          proration_behavior: "none",
        });
      } catch {
        /* ignore */
      }
      throw new AppError(reason, 402, "PAYMENT_REQUIRED");
    };

    const latestInvoiceId =
      typeof updatedSub.latest_invoice === "string"
        ? updatedSub.latest_invoice
        : updatedSub.latest_invoice?.id;

    if (latestInvoiceId) {
      let invoice = await stripe.invoices.retrieve(latestInvoiceId);
      if (invoice.status === "open" && (invoice.amount_due ?? 0) > 0) {
        try {
          invoice = await stripe.invoices.pay(latestInvoiceId, {
            payment_method: defaultPm,
          });
        } catch {
          await rollback(
            "Card was declined for the prorated charge. Seat count was not changed.",
          );
        }
      }
      const paid =
        invoice.status === "paid" ||
        invoice.paid === true ||
        (invoice.amount_due === 0 && invoice.amount_paid === 0);
      if (!paid) {
        await rollback(
          "Payment for the additional seats was not completed. Seat count was not changed.",
        );
      }
    }

    const price = (teamMembers * PRICING[plan].perUser) / 100;
    await prisma.subscription.update({
      where: { userId },
      data: { usersCount: teamMembers, price },
    });

    return {
      type: "updated",
      message: "Seats added — your card was charged the prorated amount.",
    };
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

    console.log("[Webhook][subscription.service]", event.type, "received");
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
        default:
          logger.info(`Unhandled subscription webhook event: ${event.type}`);
      }
    } catch (err) {
      logger.error(`[Webhook] Handler failed for ${event.type}:`, err);
      // Re-throw so controller returns 500 → Stripe will retry
      throw err;
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
          userId,
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

    // Fire-and-forget receipt email (non-blocking)
    prisma.user
      .findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      })
      .then((u) => {
        if (u?.email) {
          const tpl = emailTemplates.paymentSuccess(
            u,
            session.amount_total || 0,
            dbPlan.name,
          );
          return sendEmail({ to: u.email, ...tpl });
        }
      })
      .catch((err) =>
        logger.error(`[Email] paymentSuccess send failed: ${err.message}`),
      );

    // Best-effort push notification.
    try {
      const push = require("./push.service");
      await push.sendPushToUser(
        userId,
        push.builders.paymentSuccess({ planName: dbPlan?.name || "Team plan" }),
      );
    } catch (err) {
      logger.warn(`[push] paymentSuccess notify skipped: ${err.message}`);
    }
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
      `=== PAYMENT FAILED === invoice: ${invoice.id}, subscription: ${invoice.subscription}, attempt: ${invoice.attempt_count}`,
    );
    if (!invoice.subscription) return;

    const sub = await prisma.subscription.findFirst({
      where: { paymentId: invoice.subscription },
      include: {
        user: { select: { id: true, name: true, email: true } },
        plan: { select: { name: true } },
      },
    });
    if (!sub || !this._isTeamSub(sub)) {
      if (sub) {
        console.log(
          "[Webhook][subscription.service] invoice.payment_failed skipped — not a team subscription:",
          sub.productType,
        );
      }
      return;
    }

    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "past_due" },
    });
    logger.warn(
      `Subscription ${sub.id} marked as past_due for user ${sub.userId}`,
    );

    if (invoice.attempt_count >= 4) {
      logger.error(
        `[Payment] FINAL payment failure for user ${sub.userId}. Stripe will cancel subscription.`,
      );
    }

    // Best-effort push notification.
    try {
      const push = require("./push.service");
      await push.sendPushToUser(sub.userId, push.builders.paymentFailed());
    } catch (err) {
      logger.warn(`[push] paymentFailed notify skipped: ${err.message}`);
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

    // Sync seat count & price from Stripe — handles quantity changes made
    // via the billing portal (subscription_update_confirm), our changePlan
    // endpoint, or direct Stripe dashboard edits.
    const item = subscription.items?.data?.[0];
    if (item) {
      const qty = item.quantity ?? null;
      const unitAmount = item.price?.unit_amount ?? null;
      if (qty != null) {
        updateData.usersCount = qty;
      }
      if (qty != null && unitAmount != null) {
        updateData.price = (qty * unitAmount) / 100;
      }
    }

    await prisma.subscription.update({
      where: { id: sub.id },
      data: updateData,
    });

    logger.info(
      `Subscription ${sub.id} updated: status=${updateData.status} seats=${updateData.usersCount ?? "n/c"} price=${updateData.price ?? "n/c"}`,
    );
  }

  async _handleSubscriptionDeleted(subscription) {
    logger.info(`=== SUBSCRIPTION DELETED === id: ${subscription.id}`);

    const sub = await prisma.subscription.findFirst({
      where: { paymentId: subscription.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!sub || !this._isTeamSub(sub)) {
      if (sub) {
        console.log(
          "[Webhook][subscription.service] customer.subscription.deleted skipped — not a team subscription:",
          sub.productType,
        );
      }
      return;
    }

    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "cancelled", deletedAt: new Date() },
    });
    logger.info(`Subscription cancelled for user ${sub.userId}`);

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

  async getHistory(userId, options = {}) {
    const { page = 1, limit = 20 } = options;
    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const [history, total] = await Promise.all([
      prisma.subscriptionHistory.findMany({
        where: { userId },
        skip,
        take,
        orderBy: { archivedAt: "desc" },
      }),
      prisma.subscriptionHistory.count({ where: { userId } }),
    ]);

    return {
      history,
      total,
      page: Number(page) || 1,
      totalPages: Math.ceil(total / take),
    };
  }

  async createCustomerPortalSession(userId) {
    const stripe = getStripe();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        stripeCustomerId: true,
        email: true,
        name: true,
      },
    });
    if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
    if (!user.stripeCustomerId) {
      throw new AppError(
        "No billing account found. Please make a purchase first.",
        400,
        "NO_STRIPE_CUSTOMER",
      );
    }

    const baseUrl =
      process.env.NEXTAUTH_URL ||
      process.env.APP_URL ||
      "http://localhost:3002";

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${baseUrl}/dashboard/subscription`,
    });

    return { url: session.url };
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
