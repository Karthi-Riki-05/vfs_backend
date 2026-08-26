const { prisma } = require("../lib/prisma");
const { addTeamToMember } = require("../lib/teamMembership");
const {
  getStripe,
  getStripeCurrency,
  getStripePrice,
  getStripeWebhookSecret,
} = require("../lib/stripe");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const { sendEmail, emailTemplates } = require("../utils/email");

// Pricing: per user per period (in smallest currency unit, e.g. cents).
// Lives in config/pricing.js — iap.service.js needs the same figures to record
// a purchase amount when a mobile store does not report the charged amount.
const { TEAM_PRICING: PRICING } = require("../config/pricing");

// bug-091: this file talks to Stripe using subscription.paymentId. A Play /
// App Store purchase stores a store id there, which Stripe 404s on — so every
// entry point below must first establish that the subscription is Stripe's.
const {
  assertNotStoreOwned,
  notStoreOwnedWhere,
  isStoreOwned,
  storeLabel,
} = require("../lib/storeBilling");

const downgradeUser = require("../lib/downgradeUser");
const notificationService = require("./notification.service");
const {
  TEAM_CREDITS_PER_SEAT_MONTHLY,
  TEAM_CREDITS_PER_SEAT_YEARLY,
  absorbFreeAddonCredits,
} = require("./aiCredit.service");
const { getSubscriptionPeriodEnd } = require("./pro.service");

// True only when the subscription row represents a currently-active paid period.
// `status='active'` alone is insufficient: the cron/webhook may not have flipped
// it yet after expiry. Always pair with the expiresAt wall-clock check.
function isSubscriptionLive(sub) {
  if (!sub) return false;
  if (sub.status === "expired" || sub.status === "cancelled") return false;
  if (sub.expiresAt && new Date(sub.expiresAt) <= new Date()) return false;
  return sub.status === "active" || sub.status === "cancelling";
}

class SubscriptionService {
  /**
   * Mid-cycle seat additions grant prorated AI credits immediately (bug-044):
   * addedSeats × perSeatCredits × (remaining days / period days). Previously
   * credits only refreshed at renewal, so a user paying prorated money for
   * extra seats got zero extra credits until the next invoice.
   * Increments planCredits (does not reset); renewal still recalculates the
   * full pool from the new seat count via _handleInvoicePaid.
   */
  async _grantProratedSeatCredits({
    userId,
    addedSeats,
    isYearly,
    periodStart,
    periodEnd,
  }) {
    if (!addedSeats || addedSeats <= 0) return 0;
    const perSeat = isYearly
      ? TEAM_CREDITS_PER_SEAT_YEARLY
      : TEAM_CREDITS_PER_SEAT_MONTHLY;

    let fraction = 1;
    if (periodStart && periodEnd && periodEnd > periodStart) {
      const nowSec = Math.floor(Date.now() / 1000);
      fraction = (periodEnd - nowSec) / (periodEnd - periodStart);
      fraction = Math.min(1, Math.max(0, fraction));
    }
    const credits = Math.round(addedSeats * perSeat * fraction);
    if (credits <= 0) return 0;

    await prisma.aiCreditBalance.upsert({
      where: { userId_appContext: { userId, appContext: "team" } },
      create: {
        userId,
        planCredits: credits,
        addonCredits: 0,
        planResetsAt: periodEnd ? new Date(periodEnd * 1000) : null,
        appContext: "team",
      },
      update: { planCredits: { increment: credits } },
    });
    logger.info(
      `[_grantProratedSeatCredits] user=${userId} +${credits} credits (${addedSeats} seats × ${perSeat} × ${fraction.toFixed(3)})`,
    );
    return credits;
  }

  /**
   * Returns the Stripe Price ID for the given plan type.
   * Falls back to price_data if env vars are not set.
   */
  _getProductId() {
    return getStripePrice(
      "STRIPE_TEST_PRODUCT_ID",
      "STRIPE_LIVE_PRODUCT_ID",
      "STRIPE_PRODUCT_ID",
    );
  }

  _getPriceId(plan) {
    if (plan === "monthly") {
      return (
        getStripePrice(
          "STRIPE_TEST_TEAM_MONTHLY_PRICE",
          "STRIPE_LIVE_TEAM_MONTHLY_PRICE",
          "STRIPE_TEAM_MONTHLY_PRICE",
        ) ||
        (process.env.STRIPE_MONTHLY_PRICE_ID &&
        process.env.STRIPE_MONTHLY_PRICE_ID !== "placeholder"
          ? process.env.STRIPE_MONTHLY_PRICE_ID
          : null)
      );
    }
    if (plan === "yearly") {
      return (
        getStripePrice(
          "STRIPE_TEST_TEAM_YEARLY_PRICE",
          "STRIPE_LIVE_TEAM_YEARLY_PRICE",
          "STRIPE_TEAM_YEARLY_PRICE",
        ) ||
        (process.env.STRIPE_YEARLY_PRICE_ID &&
        process.env.STRIPE_YEARLY_PRICE_ID !== "placeholder"
          ? process.env.STRIPE_YEARLY_PRICE_ID
          : null)
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
    let productId = this._getProductId();
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
        product: this._getProductId() || undefined,
        product_data: this._getProductId()
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

  async createCheckoutSession(userId, { plan, teamMembers, paymentMethodId }) {
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
            product: this._getProductId() || undefined,
            product_data: this._getProductId()
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

    // If user chose a saved card, create the subscription directly — no redirect.
    if (paymentMethodId) {
      // Attach the chosen card as the customer's default invoice payment method.
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });

      const stripePriceId = priceId;
      if (!stripePriceId) {
        // Fallback: no price ID configured — must go through hosted checkout
      } else {
        const subscription = await stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: stripePriceId, quantity: teamMembers }],
          default_payment_method: paymentMethodId,
          metadata: { userId, plan, teamMembers: String(teamMembers) },
          expand: ["latest_invoice.payment_intent", "items.data"],
        });

        // Persist the new subscription immediately (webhook may lag).
        const rawPeriodEnd = getSubscriptionPeriodEnd(subscription);
        const periodEnd = rawPeriodEnd ? new Date(rawPeriodEnd * 1000) : null;
        const newStatus =
          subscription.status === "active" ? "active" : "pending";

        // Reuse the planId from the existing subscription record if present;
        // otherwise look up (or create) a plan row matching the selected plan.
        let planIdForCreate = existingSub?.planId;
        if (!planIdForCreate) {
          let dbPlan = await prisma.plan.findFirst({
            where: {
              name: plan === "yearly" ? "Team Yearly" : "Team Monthly",
            },
          });
          if (!dbPlan) {
            dbPlan = await prisma.plan.create({
              data: {
                name: plan === "yearly" ? "Team Yearly" : "Team Monthly",
                duration: plan,
                price: 0,
                status: "active",
                tier: 2,
                appType: "enterprise",
              },
            });
          }
          planIdForCreate = dbPlan.id;
        }

        await prisma.subscription.upsert({
          where: { userId },
          update: {
            status: newStatus,
            paymentId: subscription.id,
            usersCount: teamMembers,
            productType: plan === "yearly" ? "team_yearly" : "team_monthly",
            startedAt: new Date(),
            expiresAt: periodEnd,
            appType: "enterprise",
            scheduledPlanType: null,
            scheduledTeamMembers: null,
            scheduledActivationDate: null,
          },
          create: {
            userId,
            planId: planIdForCreate,
            status: newStatus,
            paymentId: subscription.id,
            usersCount: teamMembers,
            productType: plan === "yearly" ? "team_yearly" : "team_monthly",
            startedAt: new Date(),
            expiresAt: periodEnd,
            appType: "enterprise",
          },
        });

        return {
          subscriptionId: subscription.id,
          status: subscription.status,
          directCharge: true,
          successUrl: `${baseUrl}/dashboard/subscription?subscribed=1`,
        };
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [lineItem],
      metadata: { userId, plan, teamMembers: String(teamMembers) },
      subscription_data: {
        metadata: { userId, plan, teamMembers: String(teamMembers) },
      },
      // Stripe Adaptive Pricing (account-level setting) converts to local currency
      success_url: `${baseUrl}/payment-return.html?redirect=%2Fsubscription%2Fsuccess&type=team&app_context=team&session_id={CHECKOUT_SESSION_ID}`,
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
      // bug-091: lets the UI hide the Stripe-only controls up front instead of
      // letting the user press them and collect a 409. Purpose-built flags, so
      // the client never has to sniff `provider`/`paymentId` to work this out.
      managedByStore: isStoreOwned(subscription),
      storeName: isStoreOwned(subscription) ? storeLabel(subscription) : null,
    };
  }

  async cancelSubscription(userId) {
    const stripe = getStripe();

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: { select: { name: true } } },
    });
    if (!subscription)
      throw new AppError("No active subscription found", 404, "NOT_FOUND");
    assertNotStoreOwned(subscription, "cancel");
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

    // In-app notification (non-blocking) — plan stays active until period end.
    try {
      const planName = subscription.plan?.name || "Team";
      const expiryLabel = subscription.expiresAt
        ? new Date(subscription.expiresAt).toLocaleDateString()
        : "the end of the billing period";
      await notificationService.createNotification(
        userId,
        "subscription_cancelled",
        "Subscription Cancelled",
        `Your ${planName} plan has been cancelled. It remains active until ${expiryLabel}.`,
        "/dashboard/subscription",
        { planName, expiresAt: subscription.expiresAt },
      );
    } catch (err) {
      logger.warn(`[notify] subscription_cancelled skipped: ${err.message}`);
    }

    return {
      message: "Subscription will be cancelled at end of billing period",
    };
  }

  async changePlan(userId, { plan, teamMembers }) {
    const stripe = getStripe();

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });
    // Before the no-paymentId fallthrough below: a store-owned row must NOT be
    // pushed into a Stripe checkout either, or the customer ends up paying
    // twice for one entitlement (once to Google/Apple, once to us).
    assertNotStoreOwned(subscription, "change your plan");
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

      // Any deliberate plan change while in "cancelling" state means the
      // user wants to keep the subscription — clear the pending cancel
      // (bug-042: previously the paid change was silently lost at period end).
      const wasCancelling = subscription.status === "cancelling";

      if (teamMembers === currentQuantity && !priceIsStale) {
        // Re-picking the exact current plan while cancelling is the most
        // natural "I want my plan back" gesture — treat it as reactivation
        // instead of a noop (bug-045).
        if (wasCancelling) {
          const result = await this.reactivateSubscription(userId);
          return {
            type: "reactivated",
            message: result?.message || "Subscription reactivated successfully",
          };
        }
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
          ...(wasCancelling ? { cancel_at_period_end: false } : {}),
        });
        const newPrice = (teamMembers * PRICING[plan].perUser) / 100;
        await prisma.subscription.update({
          where: { userId },
          data: {
            price: newPrice,
            ...(wasCancelling ? { status: "active" } : {}),
          },
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
          ...(wasCancelling ? { cancel_at_period_end: false } : {}),
        });

        // Record the credit in transaction_logs so billing history shows it.
        await prisma.transactionLog
          .create({
            data: {
              userId,
              chargeId: subscription.paymentId,
              txnId: `reduce_${subscription.paymentId}_${currentQuantity}_to_${teamMembers}`,
              amountCharged: 0,
              currency: getStripeCurrency(),
              status: "credit",
              paymentMethod: "stripe_credit",
              appType: "enterprise",
              appContext: "team",
              purchaseType: "team_subscription",
            },
          })
          .catch((err) => {
            if (err.code !== "P2002")
              logger.warn(
                `[changePlan] reduce-seats transactionLog write failed: ${err.message}`,
              );
          });
      }

      const price = (teamMembers * PRICING[plan].perUser) / 100;
      await prisma.subscription.update({
        where: { userId },
        data: {
          usersCount: teamMembers,
          price,
          ...(wasCancelling ? { status: "active" } : {}),
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

      // A pending cancel would delete the Stripe sub at period end — the
      // exact moment the scheduled yearly activation needs it alive. Clear
      // the cancel: scheduling an upgrade means the user is staying (bug-042).
      if (subscription.status === "cancelling") {
        await stripe.subscriptions.update(subscription.paymentId, {
          cancel_at_period_end: false,
        });
      }

      await prisma.subscription.update({
        where: { userId },
        data: {
          scheduledPlanType: plan,
          scheduledTeamMembers: teamMembers,
          scheduledActivationDate: activationDate,
          ...(subscription.status === "cancelling" ? { status: "active" } : {}),
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
    assertNotStoreOwned(subscription, "change your plan");
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
        // bug-091: never auto-charge a store-owned subscription through Stripe.
        // Excluded in the QUERY rather than skipped in the loop so such a row
        // is not claimed (status flipped to "activating") only to be abandoned.
        // changePlan now refuses to schedule one, so this is belt-and-braces
        // for rows scheduled before that guard existed.
        ...notStoreOwnedWhere(),
      },
      include: { user: true },
    });

    let activated = 0;
    let failed = 0;
    let skipped = 0;
    // bug-031: a row whose claiming replica crashed mid-processing becomes
    // reclaimable after this window (else it would stick in "activating" forever).
    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);

    for (const sub of due) {
      const userId = sub.userId;
      const plan = sub.scheduledPlanType;
      const teamMembers = sub.scheduledTeamMembers || sub.usersCount || 5;

      // bug-031: atomically CLAIM this row before any Stripe call, so two
      // concurrent replicas (each running the same cron) can't both charge the
      // customer's saved card. Postgres row-level UPDATE atomicity is the
      // mutual-exclusion primitive — no advisory lock, no Redis, no schema
      // change. Exactly one replica's updateMany matches (count === 1).
      const claim = await prisma.subscription.updateMany({
        where: {
          userId: sub.userId,
          scheduledPlanType: sub.scheduledPlanType,
          scheduledActivationDate: sub.scheduledActivationDate,
          OR: [
            { status: { not: "activating" } },
            { updatedAt: { lt: staleThreshold } },
          ],
        },
        data: { status: "activating" },
      });
      if (claim.count === 0) {
        // Another replica already claimed this row this tick — skip it.
        skipped += 1;
        continue;
      }

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
                product: this._getProductId() || undefined,
                product_data: this._getProductId()
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

    return { processed: due.length, activated, failed, skipped };
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

    // Paying to change the plan is an unambiguous "I'm staying" signal — if
    // the subscription was set to cancel at period end, clear that flag as
    // part of the same update so the paid upgrade doesn't die at renewal.
    const wasCancelling = subscription.status === "cancelling";

    let updatedSub;
    try {
      updatedSub = await stripe.subscriptions.update(subscription.paymentId, {
        items: [this._buildItemForPlan(subItem.id, plan, teamMembers)],
        metadata: { userId, plan, teamMembers: String(teamMembers) },
        proration_behavior: "always_invoice",
        default_payment_method: defaultPm,
        ...(wasCancelling ? { cancel_at_period_end: false } : {}),
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
          // Restore the pending cancellation if the payment failed — the
          // user's original cancel request must survive a declined upgrade.
          ...(wasCancelling ? { cancel_at_period_end: true } : {}),
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

    let paidInvoice = null;
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
      paidInvoice = invoice;
    }

    const price = (teamMembers * PRICING[plan].perUser) / 100;
    await prisma.subscription.update({
      where: { userId },
      data: {
        usersCount: teamMembers,
        price,
        ...(wasCancelling ? { status: "active" } : {}),
      },
    });

    // Grant prorated AI credits for the added seats right away (bug-044) —
    // the user paid prorated money for them; credits must not lag to renewal.
    await this._grantProratedSeatCredits({
      userId,
      addedSeats: teamMembers - currentQuantity,
      isYearly: plan === "yearly",
      periodStart:
        updatedSub.items?.data?.[0]?.current_period_start ??
        updatedSub.current_period_start ??
        null,
      periodEnd: getSubscriptionPeriodEnd(updatedSub),
    }).catch((err) =>
      logger.error(
        `[_upgradeSeatsOffSession] prorated credit grant failed: ${err.message}`,
      ),
    );

    // Record the prorated charge in transaction_logs so billing history shows it.
    if (latestInvoiceId) {
      await prisma.transactionLog
        .create({
          data: {
            userId,
            chargeId:
              (typeof paidInvoice?.payment_intent === "string"
                ? paidInvoice.payment_intent
                : paidInvoice?.payment_intent?.id) || latestInvoiceId,
            txnId: latestInvoiceId,
            amountCharged: paidInvoice?.amount_paid ?? 0,
            currency: paidInvoice?.currency || getStripeCurrency(),
            status: "success",
            paymentMethod: "card",
            appType: "enterprise",
            appContext: "team",
            purchaseType: "team_subscription",
          },
        })
        .catch((err) => {
          if (err.code !== "P2002")
            logger.error(
              `[_upgradeSeatsOffSession] transactionLog write failed: ${err.message}`,
            );
        });
    }

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
    const webhookSecret = getStripeWebhookSecret();
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
    // NOTE (bug-B1, deferred): `flow_addon` is missing here, so it falls through
    // to the team path and throws on PRICING[plan] if this receiver ever gets a
    // flow_addon checkout. Left as-is pending the dedicated webhook-unification
    // pass (the unified handler must reconcile this service's re-throw-on-error
    // with payment.service's swallow-and-200 before packs can route here).
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

    // Idempotency: skip if this checkout session was already processed.
    // TransactionLog.txnId also has a @@unique constraint as a DB-level
    // safeguard for simultaneous duplicate deliveries.
    const existingTxn = await prisma.transactionLog.findFirst({
      where: { txnId: session.id },
    });
    if (existingTxn) {
      logger.info(
        `[_handleCheckoutComplete] Session ${session.id} already processed — skipping duplicate`,
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
              appContext: existingSub.appType === "enterprise" ? "team" : "pro",
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

    // ── Team workspace get-or-create ─────────────────────────────────────
    // The team-context flow/project queries filter by `workspaceId`
    // (flow.service.getAllFlows: where = { workspaceId, deletedAt: null }), so a
    // real Team row MUST exist and migrated flows MUST carry its id — otherwise
    // they "disappear" (appContext='team' but workspaceId=null = visible nowhere).
    // Idempotent: re-uses the user's existing team on plan changes / retries.
    const teamOwner = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    let team = await prisma.team.findFirst({
      where: { teamOwnerId: userId, appContext: "team", deletedAt: null },
    });
    if (!team) {
      team = await prisma.team.create({
        data: {
          name: teamOwner?.name ? `${teamOwner.name}'s Team` : "My Team",
          teamOwnerId: userId,
          appType: "enterprise",
          appContext: "team",
          status: "active",
          teamMem: members,
          countMem: 1,
          verifyTeam: "system",
        },
      });
      // Add the owner as the first team member (mirrors team.service.createTeam).
      // CHANGE-001: addTeamToMember is idempotent — it appends the team id to
      // the owner's existing workspace row rather than creating a second one.
      await addTeamToMember(prisma, {
        userId,
        workspaceId: userId,
        teamId: team.id,
        role: "OWNER",
        // A Team-plan upgrade grants a TEAM seat.
        appContext: team.appContext || "team",
      });
      logger.info(`[Team Upgrade] Created team ${team.id} for user ${userId}`);
    }

    // (Removed the pre-migration snapshot counts — DATA-LOSS-001. They existed
    // only to log how much personal data the migration moved into the team.
    // We no longer migrate personal data, so there is nothing to snapshot.)
    logger.info(
      `[Team Upgrade] Setting up team ${team.id} for user ${userId} — ` +
        `personal data left untouched.`,
    );

    // Seat-scaled AI credit grant (monthly: seats × 60; yearly: seats × 800
    // for the whole year upfront). Was previously hardcoded to 300, which
    // made Team Yearly show the Team Monthly amount until first renewal.
    const teamPlanCredits =
      plan === "yearly"
        ? members * TEAM_CREDITS_PER_SEAT_YEARLY
        : members * TEAM_CREDITS_PER_SEAT_MONTHLY;

    await prisma.$transaction([
      ...archiveOps,
      prisma.subscription.upsert({
        where: { userId },
        update: {
          planId: dbPlan.id,
          status: "active",
          // MUST be cleared: _handleSubscriptionDeleted soft-deletes this row
          // on expiry/refund, and every access gate short-circuits on it —
          // `isSubscriptionLive` opens with `if (!sub || sub.deletedAt) return
          // false` and `paidOwnerWhere` requires `deletedAt: null`. Leaving it
          // set meant a user who RE-subscribed after a previous plan ended paid
          // in full, got status='active' with a future expiresAt, and still
          // read as Free everywhere. Observed 2026-08-20 on a real Play
          // purchase: active + expiresAt 2026-09-20 + deletedAt 10:16 → the UI
          // showed "free account" while users.currentVersion said "team".
          // First-time buyers never hit it — there is no old row to un-delete.
          deletedAt: null,
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
      //
      // SECURITY (multi-plan auth leak fix): do NOT set proPurchasedAt here.
      // proPurchasedAt is the SOLE marker of the standalone $5 Pro product and
      // is what every Pro-app gate (enforceProContext, ProGuard, switchApp) keys
      // on. A Team subscription unlocks Pro-tier *features inside the Team
      // workspace*, but must NEVER grant access to the standalone Pro app — that
      // is a separate purchase. Writing proPurchasedAt on team activation let a
      // Team subscriber walk straight into the Pro app for free.
      prisma.user.update({
        where: { id: userId },
        data: {
          hasPro: true,
          currentVersion: "team",
          teamUnlimitedFlows: true,
        },
      }),
      // Grant seat-scaled team AI credits scoped to team appContext.
      // Monthly: seats × 60. Yearly: full year upfront (seats × 800) —
      // e.g. 5 seats yearly = 2500. Mirrors aiCredit.grantTeamCredits().
      prisma.aiCreditBalance.upsert({
        where: { userId_appContext: { userId, appContext: "team" } },
        create: {
          userId,
          planCredits: teamPlanCredits,
          addonCredits: 0,
          planResetsAt: expiresAt,
          appContext: "team",
        },
        update: {
          planCredits: teamPlanCredits,
          planResetsAt: expiresAt,
        },
      }),
      // DATA-LOSS-001 fix: we intentionally DO NOT migrate/retag the user's
      // existing personal data on upgrade. Previously this block moved every
      // personal flow/project into the new team (workspaceId = team.id) and retagged
      // shapes/groups to appContext:"team". That had two serious effects:
      //   1. The flows vanished from the user's PERSONAL view (which loads by
      //      default after checkout) → the "No flows yet" data-loss report.
      //   2. Private personal flows were silently exposed to every team member.
      // Personal data now stays personal (workspaceId = null) and remains visible in
      // the personal workspace across all plan tiers; the new team starts empty
      // and the owner moves flows into it deliberately. Personal listing queries
      // no longer filter by appContext, so the legacy 'free' tag is harmless.
      // (AI conversation history likewise stays in its original context.)
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
      // Mirror the Team purchase in subscription_history so it shows up
      // on the user's Billing page in the Team app (separate from the
      // Free / Pro app history thanks to the appContext column).
      prisma.subscriptionHistory.create({
        data: {
          userId,
          planName:
            dbPlan?.name ||
            (plan === "yearly" ? "Team Yearly" : "Team Monthly"),
          productType: plan === "yearly" ? "team_yearly" : "team_monthly",
          status: "active",
          price: (session.amount_total || 0) / 100,
          currency: session.currency || getStripeCurrency(),
          isRecurring: true,
          source: "stripe",
          startedAt: new Date(),
          expiresAt,
          appContext: "team",
          stripePaymentId: session.payment_intent || session.id,
          archivedReason: "purchase",
          snapshot: {
            sessionId: session.id,
            members,
            plan,
          },
        },
      }),
    ]);

    // bug-156: the array transaction above just created/updated the team wallet.
    // Now carry the buyer's paid add-on credits from their `free` wallet into it
    // (Option A — free PLAN credits are not carried). Own atomic move-then-zero,
    // idempotent on webhook replay.
    await absorbFreeAddonCredits(prisma, userId, "team");

    logger.info(
      `[Team Upgrade] Complete for user ${userId} → team ${team.id}. ` +
        `Personal flows/projects/shapes preserved in the user's personal workspace (NOT moved into the team).`,
    );

    logger.info(
      `Subscription activated for user ${userId}: ${plan}, ${members} members`,
    );

    // Fire-and-forget receipt email (non-blocking).
    // Suppressed on a store RENEWAL for the same reason as the push below —
    // a 5-minute test renewal cycle would otherwise email the user every
    // 5 minutes. A real renewal receipt is a separate, deliberate feature;
    // re-sending the NEW-PURCHASE receipt is simply wrong.
    const isRenewal = session?.metadata?.isRenewal === "true";
    if (isRenewal) {
      logger.info(
        `[Email] paymentSuccess suppressed for user ${userId} — renewal, not a new purchase`,
      );
    }
    if (!isRenewal)
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

    // Best-effort push notification — FIRST purchase only.
    //
    // Store RENEWALS reuse this whole handler (iap.service._grant routes both
    // INITIAL_PURCHASE and RENEWAL here), so without this guard every renewal
    // re-announced "Payment confirmed" as though the user had just bought.
    // Harmless-looking monthly, but Google renews LICENSE-TESTER subscriptions
    // roughly every 5 minutes, which on 2026-08-20 produced a banner every
    // 5 minutes on the tester's phone. It only surfaced that day because RTDN
    // had never been delivered before, so renewals were simply never processed.
    //
    // Stripe sessions never carry this flag, so web checkout is unchanged.
    if (isRenewal) {
      logger.info(
        `[push] paymentSuccess suppressed for user ${userId} — renewal, not a new purchase`,
      );
    } else {
      try {
        const push = require("./push.service");
        // "team" scopes delivery to Team-app devices — omitting it broadcast
        // this Team purchase push to the user's Pro app too (bug-052).
        await push.sendPushToUser(
          userId,
          push.builders.paymentSuccess({
            planName: dbPlan?.name || "Team plan",
          }),
          "team",
        );
      } catch (err) {
        logger.warn(`[push] paymentSuccess notify skipped: ${err.message}`);
      }
    }

    // In-app notification — FIRST purchase only, same rule as the push and the
    // email above. Credit amount is seat-scaled.
    //
    // This was MISSED when the renewal guard was added for the other two
    // channels: the push stopped repeating but the notification centre kept
    // filling up, one "Subscription Activated!" per renewal. Reported on
    // 2026-08-25 with three identical entries 5 minutes apart — which is
    // exactly Google's LICENSE-TESTER renewal cadence, so it reproduces in
    // minutes on a test account and monthly in production.
    if (isRenewal) {
      logger.info(
        `[notify] subscription_activated suppressed for user ${userId} — renewal`,
      );
    } else {
      try {
        const planName = dbPlan?.name || "Team";
        await notificationService.createNotification(
          userId,
          "subscription_activated",
          "Subscription Activated!",
          `Your ${planName} plan is now active. You have ${teamPlanCredits} AI credits.`,
          "/dashboard/subscription",
          { planName, creditAmount: teamPlanCredits, expiresAt },
        );
      } catch (err) {
        logger.warn(`[notify] subscription_activated skipped: ${err.message}`);
      }
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
    logger.info(
      `=== INVOICE PAID === subscription: ${invoice.subscription} invoice: ${invoice.id}`,
    );
    if (!invoice.subscription) return;

    // Idempotency: skip if this invoice renewal has already been processed.
    const existingTxn = await prisma.transactionLog.findFirst({
      where: { txnId: invoice.id },
    });
    if (existingTxn) {
      logger.info(
        `[_handleInvoicePaid] Invoice ${invoice.id} already processed — skipping duplicate`,
      );
      return;
    }

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
      logger.info(
        `[_handleInvoicePaid] Skipping non-team subscription: ${sub.productType}`,
      );
      return;
    }

    // Prefer Stripe's authoritative period_end; fall back to calculating from productType.
    const periodEnd = invoice.lines?.data?.[0]?.period?.end;
    const expiresAt = periodEnd
      ? new Date(periodEnd * 1000)
      : (() => {
          const d = new Date();
          if (sub.productType === "team_yearly") {
            d.setFullYear(d.getFullYear() + 1);
          } else {
            d.setMonth(d.getMonth() + 1);
          }
          return d;
        })();

    const seats = sub.usersCount || 5;
    const isYearly = sub.productType === "team_yearly";
    // Monthly: 60 credits/seat. Yearly: full year upfront (800/seat/year),
    // matching aiCredit.service grant logic — e.g. 5 seats yearly = 2500.
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
      `[_handleInvoicePaid] Renewed: user=${sub.userId} seats=${seats} credits=${credits} expiresAt=${expiresAt.toISOString()}`,
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
      await push.sendPushToUser(
        sub.userId,
        push.builders.paymentFailed(),
        "team",
      );
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

    const item = subscription.items?.data?.[0];

    // Portal-confirmed seat change while a cancel was pending (bug-042):
    // Stripe's subscription_update_confirm flow applies the new quantity but
    // leaves cancel_at_period_end untouched — the user paid the proration
    // yet the sub would still die at renewal. A confirmed quantity change is
    // an unambiguous "I'm staying" signal, so clear the pending cancel.
    // (A plain cancel never changes quantity, so this can't misfire on it.)
    let cancelAtPeriodEnd = subscription.cancel_at_period_end === true;
    const qtyChanged =
      item?.quantity != null &&
      sub.usersCount != null &&
      item.quantity !== sub.usersCount;
    if (cancelAtPeriodEnd && qtyChanged) {
      try {
        const stripe = getStripe();
        await stripe.subscriptions.update(subscription.id, {
          cancel_at_period_end: false,
        });
        cancelAtPeriodEnd = false;
        logger.info(
          `[_handleSubscriptionUpdated] Cleared pending cancel for ${subscription.id} — seat change confirmed while cancelling`,
        );
      } catch (err) {
        logger.error(
          `[_handleSubscriptionUpdated] Failed to clear cancel_at_period_end for ${subscription.id}: ${err.message}`,
        );
      }
    }

    // Stripe keeps status "active" for a sub that's merely set to cancel at
    // period end — map that to our "cancelling" so a webhook can't clobber
    // the cancelling state written by cancelSubscription().
    const mappedStatus =
      subscription.status === "canceled"
        ? "cancelled"
        : subscription.status === "active" && cancelAtPeriodEnd
          ? "cancelling"
          : subscription.status;
    const updateData = { status: mappedStatus };

    const rawPeriodEnd = getSubscriptionPeriodEnd(subscription);
    if (rawPeriodEnd) {
      updateData.expiresAt = new Date(rawPeriodEnd * 1000);
    }
    const rawPeriodStart =
      item?.current_period_start ?? subscription.current_period_start;
    if (rawPeriodStart) {
      updateData.startedAt = new Date(rawPeriodStart * 1000);
    }

    // Sync seat count & price from Stripe — handles quantity changes made
    // via the billing portal (subscription_update_confirm), our changePlan
    // endpoint, or direct Stripe dashboard edits.
    if (item) {
      const qty = item.quantity ?? null;
      const unitAmount = item.price?.unit_amount ?? null;
      if (qty != null) {
        updateData.usersCount = qty;
      }
      if (qty != null && unitAmount != null) {
        updateData.price = (qty * unitAmount) / 100;
      }

      // Seats increased (portal-confirmed upgrade or dashboard edit) →
      // grant prorated AI credits for the new seats now (bug-044). The
      // off-session path already updates usersCount inline before this
      // webhook arrives, so its grant isn't repeated here (no qty diff).
      if (qty != null && sub.usersCount != null && qty > sub.usersCount) {
        await this._grantProratedSeatCredits({
          userId: sub.userId,
          addedSeats: qty - sub.usersCount,
          isYearly: sub.productType === "team_yearly",
          periodStart:
            item.current_period_start ??
            subscription.current_period_start ??
            null,
          periodEnd: getSubscriptionPeriodEnd(subscription),
        }).catch((err) =>
          logger.error(
            `[_handleSubscriptionUpdated] prorated credit grant failed: ${err.message}`,
          ),
        );
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

    // CRITICAL: revoke team access (Pro lifetime preserved if proPurchasedAt set)
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

  async getHistory(userId, options = {}) {
    const { page = 1, limit = 20, appContext } = options;
    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    // When the caller passes their current workspace context (free / pro
    // / team), each app's Billing page sees only its own purchases.
    // Without it we return every row (admin / debug usage).
    // Owner decision 2026-07-02: the Billing page history shows ONLY plans
    // that ran out (status "expired") — not cancelled/active/replaced rows.
    const where = appContext
      ? { userId, appContext, status: "expired" }
      : { userId, status: "expired" };

    const [history, total] = await Promise.all([
      prisma.subscriptionHistory.findMany({
        where,
        skip,
        take,
        orderBy: { archivedAt: "desc" },
      }),
      prisma.subscriptionHistory.count({ where }),
    ]);

    return {
      history,
      total,
      page: Number(page) || 1,
      totalPages: Math.ceil(total / take),
    };
  }

  async createCustomerPortalSession(userId, returnPath) {
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

    // Open-redirect guard: only honour a same-site relative path (starts with a
    // single "/", not "//" which browsers treat as protocol-relative). Anything
    // else falls back to the subscription page.
    const safePath =
      typeof returnPath === "string" &&
      returnPath.startsWith("/") &&
      !returnPath.startsWith("//")
        ? returnPath
        : "/dashboard/subscription";

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${baseUrl}${safePath}`,
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
    assertNotStoreOwned(subscription, "resume it");
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

  /**
   * Daily sweep: flip every subscription whose paid period has ended to
   * status='expired' and downgrade the owning user.
   *
   * WHY: a subscription row keeps status='active' after it lapses — the status
   * only changes via a Stripe webhook or an admin action, and there was no job
   * to expire it on time. As a result every query that filters on
   * `status:'active'` (team context, AI credits, team membership, stats…) kept
   * treating an expired subscriber as fully paid. This sweep is the single
   * source of truth that closes that gap app-wide.
   *
   * SAFETY:
   *  - Only rows with a real past `expiresAt` are touched (lifetime / null
   *    expiry rows are ignored).
   *  - A 1-day grace buffer avoids racing a legitimate Stripe renewal whose
   *    `invoice.paid` webhook (which pushes `expiresAt` forward) is briefly
   *    delayed. A healthy renewing sub already has a future `expiresAt`, so it
   *    is never swept.
   *  - `cancelling` (cancel-at-period-end) is included so a cancelled plan
   *    also expires once its period ends.
   *  - `downgradeUser` preserves a separately-purchased lifetime Pro.
   *
   * @returns {Promise<{ scanned:number, expired:number, downgraded:number }>}
   */
  async expireLapsedSubscriptions() {
    const GRACE_MS = 24 * 60 * 60 * 1000; // 1-day buffer for renewal/webhook lag
    const cutoff = new Date(Date.now() - GRACE_MS);

    const lapsed = await prisma.subscription.findMany({
      where: {
        deletedAt: null,
        status: { in: ["active", "cancelling"] },
        expiresAt: { not: null, lt: cutoff },
      },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        productType: true,
        // Needed to archive the plan into subscription_history below.
        price: true,
        currency: true,
        isRecurring: true,
        startedAt: true,
        appContext: true,
        provider: true,
        status: true,
        plan: { select: { name: true } },
      },
    });

    let expired = 0;
    let downgraded = 0;
    for (const sub of lapsed) {
      try {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: "expired" },
        });
        expired += 1;

        // Archive the plan that just ran out (bug-129).
        //
        // WHY: getHistory() shows ONLY rows with status "expired" — the
        // Billing page's "past plans" list, per the owner decision of
        // 2026-07-02. But this job previously updated `subscription.status`
        // and wrote NOTHING here, so a team plan could expire without ever
        // producing an "expired" history row. The row written at purchase
        // time says "active" and is never revised. Net effect: the panel was
        // permanently empty for every team subscriber, while Pro flow-addon
        // users saw entries because pro.service logFlowAddonHistory() does
        // record its own expiries.
        //
        // Non-blocking on purpose: a failure here must never stop the
        // downgrade below, which is the part that actually protects
        // entitlements.
        try {
          await prisma.subscriptionHistory.create({
            data: {
              userId: sub.userId,
              planName:
                sub.plan?.name ||
                (sub.productType === "team_yearly"
                  ? "Team Yearly"
                  : sub.productType === "team_monthly"
                    ? "Team Monthly"
                    : sub.productType || "Subscription"),
              productType: sub.productType || null,
              status: "expired",
              price: sub.price ?? 0,
              currency: sub.currency || "usd",
              isRecurring: sub.isRecurring ?? true,
              source: sub.provider || "stripe",
              startedAt: sub.startedAt || null,
              expiresAt: sub.expiresAt || null,
              appContext: sub.appContext,
              archivedReason: "subscription_expiry",
              snapshot: {
                subscriptionId: sub.id,
                previousStatus: sub.status,
                expiredAt: new Date().toISOString(),
              },
            },
          });
        } catch (err) {
          logger.error(
            `[expireLapsedSubscriptions] history row failed for subscription ${sub.id}: ${err.message}`,
          );
        }
        try {
          await downgradeUser(sub.userId, { reason: "subscription_expiry" });
          downgraded += 1;
        } catch (err) {
          logger.error(
            `[expireLapsedSubscriptions] downgrade failed for user ${sub.userId}: ${err.message}`,
          );
        }
        // In-app notification (non-blocking).
        try {
          const planName =
            sub.productType === "team_yearly"
              ? "Team Yearly"
              : sub.productType === "team_monthly"
                ? "Team Monthly"
                : "Team";
          await notificationService.createNotification(
            sub.userId,
            "subscription_expired",
            "Subscription Expired",
            `Your ${planName} plan has expired. Upgrade to continue using team features.`,
            "/dashboard/subscription",
            { planName, expiredAt: new Date() },
          );
        } catch (err) {
          logger.warn(
            `[notify] subscription_expired skipped for ${sub.userId}: ${err.message}`,
          );
        }
      } catch (err) {
        logger.error(
          `[expireLapsedSubscriptions] failed to expire sub ${sub.id}: ${err.message}`,
        );
      }
    }

    if (lapsed.length) {
      logger.info(
        `[expireLapsedSubscriptions] scanned=${lapsed.length} expired=${expired} downgraded=${downgraded}`,
      );
    }
    return { scanned: lapsed.length, expired, downgraded };
  }
}

module.exports = new SubscriptionService();
