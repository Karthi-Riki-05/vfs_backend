"use strict";

/**
 * IAP entitlement service — processes RevenueCat webhook events for every
 * mobile product (Pro lifetime, flow packs, flow add-ons, AI credits, team
 * seat plans).
 *
 * DESIGN: maximal reuse. Purchases are translated into the same
 * "session-shaped" objects the Stripe webhook handlers already consume, then
 * delegated to those existing, idempotent handlers:
 *   - team        → subscriptionService._handleCheckoutComplete(session)
 *   - flow_addon  → proService.handleFlowAddonCheckoutWebhook(session)
 *   - flow_pack   → proService.handleExtraFlowsWebhook(session)
 *   - ai_credits  → aiCredit.service addAddonCredits (mirrors payment.service)
 * so mobile and web purchases share ONE set of business rules.
 *
 * Idempotency is two-layered: an IapTransaction row per RevenueCat event.id
 * (unique constraint → redeliveries skipped), plus each delegated handler's
 * own txnId/paymentIntent dedup.
 *
 * CROSS-PROVIDER GUARD: an entitlement owned by an active Stripe record is
 * never overwritten by an IAP event (and lifecycle events only touch
 * RevenueCat-owned records). Users manage each purchase where they bought it.
 *
 * The RevenueCat app_user_id MUST be the ValueChart user id — the Flutter
 * shell has to call Purchases.logIn(<userId>) before any purchase.
 */

const { prisma } = require("../lib/prisma");
const logger = require("../utils/logger");
const { grantProCredits } = require("../lib/grantProCredits");
const { resolveIapProduct } = require("../config/iapProducts");

// Marks paymentId / flowAddonStripeSubId values owned by an IAP provider,
// keyed on the store's original transaction id so renewals and expirations of
// the same underlying subscription resolve to the same record.
const RC_PREFIX = "rc_";

// Every non-Stripe entitlement source. Lifecycle events may only touch
// records owned by one of these — Stripe records are read-only to IAP.
const IAP_PROVIDERS = ["revenuecat", "google", "apple"];

// Event types that grant (or re-grant) an entitlement.
const GRANT_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "NON_RENEWING_PURCHASE",
]);

class IapService {
  /** Legacy entry point — kept so the dormant RevenueCat webhook still works. */
  async handleRevenueCatEvent(event) {
    return this.handleIapEvent(event, "revenuecat");
  }

  /**
   * Entry point for every IAP event source. Adapters (Google Play validate /
   * RTDN, Apple validate / Server Notifications, RevenueCat webhook)
   * normalize their store payloads into this ONE event shape:
   *   { id, type, app_user_id, product_id, transaction_id,
   *     original_transaction_id, price, currency, store, expiration_at_ms }
   * Never throws on business-rule skips; throws only on unexpected
   * infrastructure errors so callers can log them (duplicate deliveries are
   * absorbed by the dedup ledger).
   */
  async handleIapEvent(event, provider) {
    const type = event?.type;
    const userId = event?.app_user_id || null;
    const productId =
      (type === "PRODUCT_CHANGE" ? event?.new_product_id : event?.product_id) ||
      event?.product_id ||
      null;

    if (!type) return { skipped: "missing_type" };

    if (type === "TRANSFER") {
      // Store-account transfer between app users — needs a manual decision;
      // auto-moving entitlements risks giving/stealing access.
      logger.warn(
        `[iap] TRANSFER event received — manual review required: ${JSON.stringify(
          { from: event.transferred_from, to: event.transferred_to },
        )}`,
      );
      return { skipped: "transfer" };
    }

    if (!userId) {
      logger.warn(`[iap] Event ${type} missing app_user_id — skipped`);
      return { skipped: "missing_user" };
    }

    const product = resolveIapProduct(productId);
    if (!product) {
      logger.warn(
        `[iap] Unknown product '${productId}' (event ${type}, user ${userId}) — skipped`,
      );
      return { skipped: "unknown_product" };
    }
    if (product.type === "noop") return { skipped: "noop_product" };

    // ── Dedup ledger ─────────────────────────────────────────────────────
    const eventId =
      event.id ||
      `${type}:${event.transaction_id || event.original_transaction_id || `${userId}:${productId}`}`;
    try {
      await prisma.iapTransaction.create({
        data: {
          userId,
          provider,
          store: event.store || null,
          eventId,
          eventType: type,
          productId: product.productKey,
          transactionId: event.transaction_id || null,
          priceCents:
            event.price != null ? Math.round(event.price * 100) : null,
          currency: (event.currency || "USD").toLowerCase(),
        },
      });
    } catch (err) {
      if (err && err.code === "P2002") {
        logger.info(`[iap] Duplicate event ${eventId} — skipped`);
        return { skipped: "duplicate" };
      }
      // Ledger write failed for another reason (e.g. unknown user id → FK).
      // A bad app_user_id can never be entitled anyway — stop here.
      logger.error(
        `[iap] Ledger write failed for event ${eventId}: ${err.message}`,
      );
      return { skipped: "ledger_error" };
    }

    logger.info(
      `[iap] event=${type} user=${userId} product=${product.productKey} store=${event.store || "?"}`,
    );

    // ── Dispatch ─────────────────────────────────────────────────────────
    if (GRANT_EVENTS.has(type) || type === "PRODUCT_CHANGE") {
      return this._grant(userId, product, event, provider);
    }
    switch (type) {
      case "UNCANCELLATION":
        return this._reactivate(userId, product, event);
      case "CANCELLATION":
        return this._markCancelling(userId, product, event);
      case "BILLING_ISSUE":
        return this._markPastDue(userId, product, event);
      case "EXPIRATION":
        return this._revoke(userId, product, event);
      default:
        logger.info(`[iap] Unhandled event type ${type} — ignored`);
        return { skipped: "unhandled_type" };
    }
  }

  // ── Grants ─────────────────────────────────────────────────────────────

  async _grant(userId, product, event, provider) {
    switch (product.type) {
      case "pro_lifetime":
        return this._grantProLifetime(userId, event);
      case "team":
        return this._grantTeam(userId, product, event, provider);
      case "flow_addon":
        return this._grantFlowAddon(userId, product, event);
      case "flow_pack":
        return this._grantFlowPack(userId, product, event);
      case "ai_credits":
        return this._grantAiCredits(userId, product, event);
      default:
        return { skipped: "unknown_entitlement" };
    }
  }

  /** One-time lifetime Pro unlock + 200 Pro credits (atomic). */
  async _grantProLifetime(userId, event) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          hasPro: true,
          currentVersion: "pro",
          proPurchasedAt: new Date(),
        },
      });
      await grantProCredits(
        userId,
        {
          txnId: event.transaction_id || null,
          amountCharged:
            event.price != null ? Math.round(event.price * 100) : 500,
          currency: (event.currency || "usd").toLowerCase(),
          paymentMethod: "in_app_purchase",
        },
        tx,
      );
    });
    logger.info(`[iap] Granted lifetime Pro to user ${userId}`);
    return { granted: "pro_lifetime" };
  }

  /**
   * Team seat subscription. Delegates to the Stripe checkout handler with a
   * synthesized session, then tags the subscription row as RevenueCat-owned.
   */
  async _grantTeam(userId, product, event, provider) {
    // Cross-provider guard: never clobber a live Stripe team subscription.
    const existing = await prisma.subscription.findUnique({
      where: { userId },
    });
    if (
      existing &&
      !IAP_PROVIDERS.includes(existing.provider) &&
      existing.isRecurring &&
      ["active", "cancelling", "past_due"].includes(existing.status)
    ) {
      logger.error(
        `[iap] User ${userId} bought ${product.productKey} in-app but has a live ` +
          `Stripe subscription (${existing.status}) — IAP grant skipped, needs support review`,
      );
      return { skipped: "stripe_subscription_active" };
    }

    const rcSubId = this._rcSubscriptionId(event);
    const subscriptionService = require("./subscription.service");
    await subscriptionService._handleCheckoutComplete(
      this._synthesizeSession(event, {
        subscription: rcSubId,
        metadata: {
          userId,
          plan: product.period,
          teamMembers: String(product.seats),
        },
      }),
    );

    // Tag ownership. Store renewals refresh expiry through the same
    // checkout-complete path (new txn id → new grant → new expiresAt).
    await prisma.subscription.updateMany({
      where: { userId },
      data: { provider, paymentId: rcSubId },
    });
    logger.info(
      `[iap] Team ${product.seats}-seat ${product.period} activated for user ${userId}`,
    );
    return { granted: product.productKey };
  }

  /** Monthly flow add-on (standard_100 / unlimited). */
  async _grantFlowAddon(userId, product, event) {
    // Cross-provider guard: an active Stripe-managed add-on wins.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { flowAddonStripeSubId: true, flowAddonStatus: true },
    });
    if (
      user &&
      user.flowAddonStripeSubId &&
      !user.flowAddonStripeSubId.startsWith(RC_PREFIX) &&
      ["active", "cancelling", "past_due"].includes(user.flowAddonStatus || "")
    ) {
      logger.error(
        `[iap] User ${userId} bought ${product.productKey} in-app but has a live ` +
          `Stripe flow add-on (${user.flowAddonStatus}) — IAP grant skipped, needs support review`,
      );
      return { skipped: "stripe_flow_addon_active" };
    }

    const proService = require("./pro.service");
    // session.subscription stays null so the handler skips its Stripe
    // period-end lookup; we set the RC period end + owner marker right after.
    await proService.handleFlowAddonCheckoutWebhook(
      this._synthesizeSession(event, {
        subscription: null,
        metadata: { userId, plan: product.plan },
      }),
    );
    await prisma.user.update({
      where: { id: userId },
      data: {
        flowAddonStripeSubId: this._rcSubscriptionId(event),
        flowAddonCurrentPeriodEnd: this._expirationDate(event),
      },
    });
    logger.info(
      `[iap] Flow add-on ${product.plan} activated for user ${userId}`,
    );
    return { granted: product.productKey };
  }

  /** 30-day flow pack (consumable). */
  async _grantFlowPack(userId, product, event) {
    const proService = require("./pro.service");
    await proService.handleExtraFlowsWebhook(
      this._synthesizeSession(event, {
        metadata: {
          userId,
          flowPackage: product.flowPackage,
          flowCount: String(product.flowCount),
        },
      }),
    );
    logger.info(
      `[iap] Flow pack ${product.flowPackage} credited to user ${userId}`,
    );
    return { granted: product.productKey };
  }

  /** AI credit top-up (consumable). Mirrors payment.service ai_addon_credits. */
  async _grantAiCredits(userId, product, event) {
    // No checkout metadata exists for IAP, so bill the user's current
    // workspace context — same fallback payment.service uses.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { currentVersion: true },
    });
    const appContext = user?.currentVersion || "free";

    const { addAddonCredits } = require("./aiCredit.service");
    await addAddonCredits(userId, product.credits, appContext, null);

    const amountCents =
      event.price != null ? Math.round(event.price * 100) : 0;
    const currency = (event.currency || "usd").toLowerCase();
    const txnId = event.transaction_id || `iap_${Date.now()}`;
    const planLabel = `AI Credits Addon — ${product.packType} (${product.credits} credits)`;

    await prisma.$transaction([
      prisma.transactionLog.create({
        data: {
          userId,
          txnId,
          chargeId: txnId,
          amountCharged: amountCents,
          currency,
          status: "success",
          paymentMethod: "in_app_purchase",
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
          price: amountCents / 100,
          currency,
          source: "revenuecat",
          startedAt: new Date(),
          appContext,
        },
      }),
    ]);
    logger.info(
      `[iap] Added ${product.credits} AI credits for user ${userId} (context=${appContext})`,
    );
    return { granted: product.productKey };
  }

  // ── Lifecycle (subscriptions only) ─────────────────────────────────────

  /** Auto-renew turned back on before expiry. */
  async _reactivate(userId, product, event) {
    if (product.type === "flow_addon") {
      const proService = require("./pro.service");
      await proService.handleFlowAddonSubscriptionUpdated(
        userId,
        "active",
        this._expirationDate(event),
      );
      return { updated: "flow_addon_active" };
    }
    if (product.type === "team") {
      await prisma.subscription.updateMany({
        where: { userId, provider: { in: IAP_PROVIDERS } },
        data: { status: "active" },
      });
      return { updated: "team_active" };
    }
    return { skipped: "not_a_subscription" };
  }

  /** Auto-renew turned off (or refund) — entitlement lives until period end. */
  async _markCancelling(userId, product, event) {
    if (product.type === "flow_addon") {
      const proService = require("./pro.service");
      await proService.handleFlowAddonSubscriptionUpdated(
        userId,
        "cancelling",
        this._expirationDate(event),
      );
      return { updated: "flow_addon_cancelling" };
    }
    if (product.type === "team") {
      await prisma.subscription.updateMany({
        where: { userId, provider: { in: IAP_PROVIDERS } },
        data: { status: "cancelling" },
      });
      return { updated: "team_cancelling" };
    }
    if (product.type === "pro_lifetime") {
      // A CANCELLATION for a one-time product is a store refund — revoke.
      // Credits already granted stay (mirrors the legacy webhook decision).
      await prisma.user.update({
        where: { id: userId },
        data: { hasPro: false, proPurchasedAt: null, currentVersion: "free" },
      });
      logger.info(`[iap] Pro revoked for user ${userId} (store refund)`);
      return { updated: "pro_revoked" };
    }
    return { skipped: "not_a_subscription" };
  }

  /** Store payment failed — grace period started. */
  async _markPastDue(userId, product, event) {
    if (product.type === "flow_addon") {
      const proService = require("./pro.service");
      await proService.handleFlowAddonSubscriptionUpdated(
        userId,
        "past_due",
        this._expirationDate(event),
      );
      return { updated: "flow_addon_past_due" };
    }
    if (product.type === "team") {
      await prisma.subscription.updateMany({
        where: { userId, provider: { in: IAP_PROVIDERS } },
        data: { status: "past_due" },
      });
      return { updated: "team_past_due" };
    }
    return { skipped: "not_a_subscription" };
  }

  /** Subscription actually ended — revoke the entitlement. */
  async _revoke(userId, product, event) {
    if (product.type === "flow_addon") {
      const proService = require("./pro.service");
      await proService.handleFlowAddonSubscriptionDeleted(userId);
      return { updated: "flow_addon_deleted" };
    }
    if (product.type === "team") {
      // Delegate to the Stripe deletion handler (status update + team access
      // downgrade + email) — it looks the record up by paymentId, which we
      // set to the RC subscription id at grant time.
      const subscriptionService = require("./subscription.service");
      await subscriptionService._handleSubscriptionDeleted({
        id: this._rcSubscriptionId(event),
      });
      return { updated: "team_deleted" };
    }
    if (product.type === "pro_lifetime") {
      await prisma.user.update({
        where: { id: userId },
        data: { hasPro: false, proPurchasedAt: null, currentVersion: "free" },
      });
      return { updated: "pro_revoked" };
    }
    return { skipped: "not_a_subscription" };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /**
   * Builds the minimal Stripe-checkout-session shape the existing webhook
   * handlers consume. txn ids flow into their dedup keys, so store-side
   * renewals (new transaction id) process exactly once each.
   */
  _synthesizeSession(event, overrides = {}) {
    const txnId =
      event.transaction_id ||
      event.original_transaction_id ||
      `iap_${event.id || Date.now()}`;
    return {
      id: txnId,
      payment_intent: txnId,
      subscription: null,
      amount_total: event.price != null ? Math.round(event.price * 100) : 0,
      currency: (event.currency || "usd").toLowerCase(),
      payment_method_types: ["in_app_purchase"],
      customer: null,
      metadata: {},
      ...overrides,
    };
  }

  /** Stable per-subscription id (renewals share original_transaction_id). */
  _rcSubscriptionId(event) {
    return `${RC_PREFIX}${
      event.original_transaction_id ||
      event.transaction_id ||
      event.id ||
      "unknown"
    }`;
  }

  /** RevenueCat expiration_at_ms → Date (null when absent). */
  _expirationDate(event) {
    return event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;
  }
}

module.exports = new IapService();
