"use strict";

/**
 * IAP entitlement service — processes direct store-billing events for every
 * mobile product (Pro lifetime, flow packs, flow add-ons, AI credits, team
 * seat plans). Sources: POST /iap/validate, Google RTDN, and Apple Server
 * Notifications V2. There is no billing vendor in this path — RevenueCat was
 * rejected 2026-07-21 and its dormant webhook removed 2026-08-14.
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
 * Idempotency is two-layered: an IapTransaction row per normalized event.id
 * (unique constraint → redeliveries skipped), plus each delegated handler's
 * own txnId/paymentIntent dedup.
 *
 * CROSS-PROVIDER GUARD: an entitlement owned by an active Stripe record is
 * never overwritten by an IAP event (and lifecycle events only touch
 * store-owned records). Users manage each purchase where they bought it.
 *
 * The event's app_user_id MUST be the ValueChart user id — the web app sends
 * `iap-login:<userId>` so the shell stamps it on every purchase (Play
 * obfuscatedAccountId / StoreKit applicationUsername). See IAP_CONTRACT.md.
 */

const { prisma } = require("../lib/prisma");
const logger = require("../utils/logger");
const { grantProCredits } = require("../lib/grantProCredits");
const { resolveIapProduct } = require("../config/iapProducts");
const {
  TEAM_PRICING,
  PRO_LIFETIME_PRICE_CENTS,
  AI_CREDIT_PACK_PRICE_CENTS,
  FLOW_PRICING,
  FLOW_ADDON_PLAN_PRICE_USD,
} = require("../config/pricing");

// RC_PREFIX marks paymentId / flowAddonStripeSubId values owned by an IAP
// provider; IAP_PROVIDERS is every non-Stripe entitlement source. Both now live
// in lib/storeBilling.js because subscription.service.js needs the same two
// facts to keep Stripe's hands off store-owned rows (bug-091) — the mirror of
// the _grantTeam guard below, which keeps IAP's hands off Stripe rows.
const { RC_PREFIX, IAP_PROVIDERS } = require("../lib/storeBilling");

// Event types that grant (or re-grant) an entitlement.
const GRANT_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "NON_RENEWING_PURCHASE",
]);

class IapService {
  /**
   * Entry point for every IAP event source. Adapters (Google Play validate /
   * RTDN, Apple validate / Server Notifications) normalize their store
   * payloads into this ONE event shape:
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
    // The ledger row above is deliberately written BEFORE the entitlement, so
    // concurrent redeliveries collide on the unique constraint rather than
    // double-granting. The cost is that a grant which THROWS leaves the row
    // behind, and every retry then short-circuits to `skipped: "duplicate"` —
    // which the controller reports to the client as `granted: true`.
    //
    // That is exactly how a crashed grant permanently poisoned transaction
    // ap:2000001219997091 (2026-08-12): the store had charged, nothing was
    // entitled, and each retry cheerfully claimed success. So a failed dispatch
    // now releases its own ledger row, which keeps the delivery retryable and
    // keeps "duplicate" a truthful claim that a grant actually COMPLETED.
    try {
      return await this._dispatch(type, userId, product, event, provider);
    } catch (err) {
      await this._releaseLedgerRow(eventId, err);
      throw err;
    }
  }

  /** Routes a verified event to its handler. Split out so handleIapEvent can
   * wrap every path in the ledger-release guard above — a `return` inside the
   * switch would otherwise escape it. */
  async _dispatch(type, userId, product, event, provider) {
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

  /**
   * Removes a dedup row whose grant failed, so the store's next delivery (or a
   * user-triggered Restore) can try again instead of being told it already
   * happened. Best-effort: a cleanup failure must never mask the real error,
   * but it IS loud, because the transaction is then stuck reporting success
   * while granting nothing and needs the row deleted by hand.
   */
  async _releaseLedgerRow(eventId, cause) {
    try {
      await prisma.iapTransaction.deleteMany({ where: { eventId } });
      logger.warn(
        `[iap] Grant failed for ${eventId} (${cause && cause.message}) — ledger row released so a retry can re-grant`,
      );
    } catch (err) {
      logger.error(
        `[iap] Could not release ledger row ${eventId} after a failed grant: ${err.message}. ` +
          `That transaction will now report "duplicate" and never grant — delete the row manually.`,
      );
    }
  }

  // ── Grants ─────────────────────────────────────────────────────────────

  async _grant(userId, product, event, provider) {
    switch (product.type) {
      case "pro_lifetime":
        return this._grantProLifetime(userId, product, event);
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
  async _grantProLifetime(userId, product, event) {
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
          amountCharged: this._amountCents(event, product),
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
   * synthesized session, then tags the subscription row as store-owned.
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
      this._synthesizeSession(
        event,
        {
          subscription: rcSubId,
          metadata: {
            userId,
            plan: product.period,
            teamMembers: String(product.seats),
          },
        },
        product,
      ),
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
      this._synthesizeSession(
        event,
        {
          subscription: null,
          metadata: { userId, plan: product.plan },
        },
        product,
      ),
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
      this._synthesizeSession(
        event,
        {
          metadata: {
            userId,
            flowPackage: product.flowPackage,
            flowCount: String(product.flowCount),
          },
        },
        product,
      ),
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

    // The credit is routed through addAddonCredits → resolveBillingUser, which
    // folds `free` → the user's REAL pool (e.g. team). Previously the txn/history
    // row was logged with the RAW currentVersion ("free" → appType "individual"),
    // so a credit that landed in the TEAM pool was filed as an individual
    // purchase — and the appType-scoped billing history (enterprise) never showed
    // it ("no AI-credit transaction history"). Resolve ONCE and use that context
    // for the grant AND the log so the record always matches the pool it hit.
    const { addAddonCredits, resolveBillingUser } = require("./aiCredit.service");
    const billing = await resolveBillingUser(
      userId,
      null,
      user?.currentVersion || "free",
    );
    const appContext = billing.appContext || user?.currentVersion || "free";
    await addAddonCredits(userId, product.credits, appContext, null);

    // Routed through the shared helper like every other grant path. AI credit
    // packs have no local list price (Stripe Price IDs in env only), so this
    // still records 0 — but it now WARNS, instead of silently filing a $0
    // "success" that support cannot distinguish from a free grant.
    const amountCents = this._amountCents(event, product);
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
          // Payment rail, mirroring the sibling transactionLog row's
          // paymentMethod. "stripe" | "admin" are the web-side values.
          source: "in_app_purchase",
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
  _synthesizeSession(event, overrides = {}, product = null) {
    const txnId =
      event.transaction_id ||
      event.original_transaction_id ||
      `iap_${event.id || Date.now()}`;
    return {
      id: txnId,
      payment_intent: txnId,
      subscription: null,
      amount_total: this._amountCents(event, product),
      currency: (event.currency || "usd").toLowerCase(),
      payment_method_types: ["in_app_purchase"],
      customer: null,
      metadata: {},
      ...overrides,
    };
  }

  /**
   * The purchase amount in cents for the synthesized session.
   *
   * Prefers what the store actually reported. When the store reports nothing,
   * falls back to OUR list price for the product rather than to 0 — because
   * "the store didn't tell us" and "the customer paid nothing" are different
   * statements, and every downstream consumer (transaction_logs.amount_charged,
   * subscription_history.price, the emailed receipt, the Billing page) treats
   * this number as a factual charge. Writing 0 turned an unknown into a
   * documented $0.00 receipt for a customer who had really been charged.
   *
   * Every Google Play path currently arrives here with price: null, which is
   * why before this fallback EVERY Android purchase and renewal recorded as
   * $0.00. That is our adapter's doing, not entirely Google's — there are four
   * possible sources, best first:
   *
   *   1. `orders.get({packageName, orderId})` → `Order.total`, documented as
   *      "the final amount paid by the customer, taking into account discounts
   *      and taxes". The only true receipt, and reachable on ALL FOUR paths —
   *      it keys on an order id (not a purchase token) and its docs cover "the
   *      subscription or in-app order", so one-time products included. Every
   *      path already holds the id: `sub.latestOrderId` (googleplay.service
   *      :135 validate, :275 RTDN) and `p.orderId` (:210, :315). Not called
   *      anywhere yet. Note `Order` carries THREE distinct figures for three
   *      distinct questions — `total` (what the customer paid, incl. tax → this
   *      field), `tax`, and `developerRevenueInBuyerCurrency` (what we actually
   *      receive, i.e. the right basis for revenue reporting).
   *   2. `subscriptionsv2` → `lineItems[].autoRenewingPlan.recurringPrice`
   *      (a Money: currencyCode + string `units` + nanos). The buyer's real
   *      currency and region, but Google documents it as EXCLUDING discounts
   *      and tax — so an intro-offer or promo purchase still reads full price.
   *      googleplay.service already destructures that line object and drops
   *      this field; wiring it up is the open follow-up (F1).
   *   3. Our USD list price — this function. Right ballpark, wrong currency for
   *      any non-US buyer.
   *   4. Zero — a factual claim that the customer paid nothing, and never a
   *      true one for a completed purchase. It remains this function's last
   *      resort anyway (see the tail of the body) purely because several
   *      delegated handlers do `session.amount_total || 0`, which would
   *      collapse a null straight back to 0 while losing the warning. Making
   *      "unknown" survive end-to-end means fixing those call sites too.
   *
   * `products.get` (one-time products) has no price field at all, so for those
   * this fallback is the best source we currently REACH — but not the best
   * available: per source 1, orders.get covers one-time purchases too.
   *
   * Apple's transaction path does report a real amount (applestore.service
   * `txn.price` in milliunits); its server-notification path does not.
   *
   * Whatever the source, this is a list price and NOT a receipt, so it is
   * logged as derived, and iap_transactions.price_cents is deliberately left
   * NULL — that column stays an honest record of what the store itself said.
   */
  _amountCents(event, product) {
    if (event.price != null) return Math.round(event.price * 100);

    const listPrice = this._listPriceCents(product);
    if (listPrice == null) {
      logger.warn(
        `[iap] ${product?.productKey || event.product_id} — store reported no ` +
          `price and no local list price exists; recording amount 0. The store ` +
          `receipt is the only record of what was charged.`,
      );
      return 0;
    }
    logger.info(
      `[iap] ${product.productKey} — store reported no price; using local list ` +
        `price ${listPrice} cents (estimate, not the store receipt)`,
    );
    return listPrice;
  }

  /**
   * Our list price in cents for a resolved catalog product, or null when the
   * product has no locally-known price. Prices come from config/pricing.js so
   * they cannot drift from what Stripe charges on the web.
   *
   * ai_credits now falls back to AI_CREDIT_PACK_PRICE_CENTS (the same fixed USD
   * pack prices the web charges via Stripe) so a store purchase records a
   * sensible amount instead of $0 when Google Play reports no price. It is an
   * estimate — the store receipt is still the source of truth for the exact
   * localized amount.
   */
  _listPriceCents(product) {
    if (!product) return null;
    switch (product.type) {
      case "team": {
        const tier = TEAM_PRICING[product.period];
        return tier && product.seats ? product.seats * tier.perUser : null;
      }
      case "pro_lifetime":
        return PRO_LIFETIME_PRICE_CENTS;
      case "flow_pack":
        return FLOW_PRICING[product.flowPackage] ?? null;
      case "flow_addon":
        return FLOW_ADDON_PLAN_PRICE_USD[product.plan] != null
          ? FLOW_ADDON_PLAN_PRICE_USD[product.plan] * 100
          : null;
      case "ai_credits":
        // The store rarely reports a price for consumables, so fall back to the
        // pack's known USD price (same as the web Stripe price) instead of
        // recording $0. An estimate — the store receipt remains the source of
        // truth for the exact localized amount charged.
        return AI_CREDIT_PACK_PRICE_CENTS[product.packType] ?? null;
      default:
        return null;
    }
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

  /** Normalized expiration_at_ms → Date (null when absent). */
  _expirationDate(event) {
    return event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;
  }
}

module.exports = new IapService();
