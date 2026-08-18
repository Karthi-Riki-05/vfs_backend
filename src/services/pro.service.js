const { prisma } = require("../lib/prisma");
const { setDowngradeFlagByIds } = require("../lib/flowDowngradeFlag");
const { addTeamToMember } = require("../lib/teamMembership");
const { resolveWorkspaceId } = require("../lib/workspaceScope");
const {
  getStripe,
  getStripeCurrency,
  getStripePrice,
} = require("../lib/stripe");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const { personalFlowTeamOr } = require("../lib/personalFlowScope");

// Prices live in config/pricing.js — iap.service.js needs the same figures to
// record a purchase amount when a mobile store does not report the charged
// amount (Google Play never does).
const {
  FLOW_PRICING,
  FLOW_ADDON_PLAN_PRICE_USD,
  PRO_LIFETIME_PRICE_CENTS,
} = require("../config/pricing");

// Stripe moved `current_period_end` off the top-level Subscription object
// onto each SubscriptionItem in newer API versions. Read the item-level
// field first and fall back to the (deprecated) top-level one so this keeps
// working regardless of which API version the account is pinned to.
function getSubscriptionPeriodEnd(subscription) {
  return (
    subscription?.items?.data?.[0]?.current_period_end ??
    subscription?.current_period_end ??
    null
  );
}

const FLOW_ADDON_PLAN_LABEL = {
  standard_100: "Standard — 100 Flows",
  unlimited: "Unlimited Flows",
};

// Audit trail of flow-addon status transitions (subscribed → active →
// past_due → cancelled → resubscribed → ...). Reuses SubscriptionHistory —
// no schema change — so it shows up in the existing Billing page
// "Subscription History" section automatically. See bug-035.
async function logFlowAddonHistory(
  userId,
  { plan, status, reason, startedAt, expiresAt },
) {
  try {
    await prisma.subscriptionHistory.create({
      data: {
        userId,
        planName: FLOW_ADDON_PLAN_LABEL[plan] || "Flow Add-on",
        productType: "flow_addon",
        status,
        price: FLOW_ADDON_PLAN_PRICE_USD[plan] ?? 0,
        currency: "usd",
        isRecurring: true,
        source: "stripe",
        startedAt: startedAt || new Date(),
        expiresAt: expiresAt || null,
        archivedReason: reason,
        appContext: "pro",
      },
    });
  } catch (err) {
    logger.warn(
      `[logFlowAddonHistory] failed for user ${userId} (${reason}): ${err.message}`,
    );
  }
}

class ProService {
  /**
   * Idempotent get-or-create for a user's personal Pro workspace team
   * (appContext='pro'). Every Pro activation path (mobile grant, web
   * verify-purchase, Stripe webhook) MUST call this — without it,
   * getAppStatus()'s flow-count falls back to workspaceId:null (the user's
   * personal/Team-app flows), which double-counts unrelated flows as Pro
   * usage. See bug-056.
   *
   * @param {string} userId
   * @param {import('@prisma/client').Prisma.TransactionClient} [tx] optional transaction client
   */
  async _ensureProTeam(userId, tx = prisma) {
    const existing = await tx.team.findFirst({
      where: { teamOwnerId: userId, appContext: "pro", deletedAt: null },
      select: { id: true, name: true },
    });
    if (existing) return existing;

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const team = await tx.team.create({
      data: {
        name: user?.name ? `${user.name}'s Pro Team` : "My Pro Team",
        teamOwnerId: userId,
        appContext: "pro",
        status: "active",
        countMem: 1,
        verifyTeam: "system",
      },
      select: { id: true, name: true },
    });
    // CHANGE-001: append to the owner's workspace row, or create it.
    await addTeamToMember(tx, {
      userId,
      workspaceId: userId,
      teamId: team.id,
      role: "OWNER",
      // A Pro purchase grants a PRO seat. Without this the row would default to
      // `team` and the buyer's own workspace would be missing from the Pro
      // switcher — the seat exists but not in the app they just paid for.
      appContext: "pro",
    });
    return team;
  }

  /**
   * Grant Pro from the mobile app (Flutter WebView), with NO Stripe charge.
   * The purchase already happened in the App Store / Play Store, so this is
   * called automatically by ProGuard once a `?app=pro` user is authenticated.
   *
   * Provisions three things atomically and idempotently:
   *   1. 50 lifetime Pro AI credits (appContext='pro', planResetsAt=NULL —
   *      Pro never refills; see aiCredit.service getOrCreateBalance).
   *   2. User promotion: hasPro=true, currentVersion='pro', proPurchasedAt set.
   *   3. The user's own Pro team (appContext='pro') so Pro flows get a stable
   *      workspaceId workspace instead of NULL.
   *
   * Safe to call on every app launch: when everything already exists it returns
   * `{ alreadyGranted: true }` without writing. Existing credit balances are
   * never reset or doubled (upsert update is a no-op); the original
   * proPurchasedAt is preserved.
   *
   * @param {string} userId
   */
  async grantFromMobile(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        hasPro: true,
        proPurchasedAt: true,
        currentVersion: true,
      },
    });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");

    const [existingProTeam, existingBalance] = await Promise.all([
      prisma.team.findFirst({
        where: { teamOwnerId: userId, appContext: "pro", deletedAt: null },
        select: { id: true, name: true },
      }),
      prisma.aiCreditBalance.findUnique({
        where: { userId_appContext: { userId, appContext: "pro" } },
        select: { planCredits: true, planResetsAt: true },
      }),
    ]);

    // Fully provisioned already → idempotent no-op (WebView calls this on every
    // launch). No DB writes so the response returns in <10ms.
    if (
      user.hasPro &&
      user.proPurchasedAt &&
      existingProTeam &&
      existingBalance
    ) {
      return {
        alreadyGranted: true,
        currentVersion: user.currentVersion,
        hasPro: user.hasPro,
        proPurchasedAt: user.proPurchasedAt,
        planCredits: existingBalance.planCredits,
        planResetsAt: existingBalance.planResetsAt,
        proTeamId: existingProTeam.id,
        proTeamName: existingProTeam.name,
        message: "Pro already active",
      };
    }

    // Preserve the original purchase date if Pro was partially provisioned.
    const purchasedAt = user.proPurchasedAt || new Date();
    const proTeamName = `${user.name || "My"}'s Pro Team`;

    const proTeam = await prisma.$transaction(async (tx) => {
      // 1. Pro AI credits — 50 lifetime, never resets. `update: {}` keeps any
      //    existing balance/addons intact so a re-grant can never double them.
      await tx.aiCreditBalance.upsert({
        where: { userId_appContext: { userId, appContext: "pro" } },
        create: {
          userId,
          appContext: "pro",
          planCredits: 50,
          addonCredits: 0,
          planResetsAt: null,
        },
        update: {},
      });

      // 2. Promote the user to Pro.
      await tx.user.update({
        where: { id: userId },
        data: {
          hasPro: true,
          currentVersion: "pro",
          proPurchasedAt: purchasedAt,
        },
      });

      // 3. Auto-create the user's personal Pro team (idempotent).
      if (existingProTeam) return existingProTeam;

      const team = await tx.team.create({
        data: {
          name: proTeamName,
          teamOwnerId: userId,
          appContext: "pro",
          status: "active",
          countMem: 1,
          verifyTeam: "system",
        },
        select: { id: true, name: true },
      });
      // CHANGE-001: append to the owner's workspace row, or create it.
      await addTeamToMember(tx, {
        userId,
        workspaceId: userId,
        teamId: team.id,
        role: "OWNER",
        appContext: "pro",
      });
      return team;
    });

    logger.info(
      `[ProService.grantFromMobile] Pro granted to user ${userId} (team ${proTeam.id})`,
    );

    return {
      alreadyGranted: false,
      currentVersion: "pro",
      hasPro: true,
      proPurchasedAt: purchasedAt,
      planCredits: 50,
      planResetsAt: null,
      proTeamId: proTeam.id,
      proTeamName: proTeam.name,
      message: "Pro granted successfully",
    };
  }

  /**
   * @param {string} userId              the caller
   * @param {string|null} requestedWorkspaceId  X-Workspace-Context (a claim)
   *
   * Pro entitlements are INHERITED from the workspace owner, exactly as team
   * entitlements are — a Pro workspace is a tenant like any other. So when the
   * caller is switched into someone else's workspace, the flow allowance, the
   * add-on and the usage count all come from that OWNER, not from the caller.
   *
   * `createFlow` already enforced it this way (its limit check reads the
   * workspace owner's row), but these read endpoints did not — so a member
   * inside a workspace whose owner had bought the Standard 100-flow add-on was
   * shown "0 / 10" while the server would happily let them create up to 100.
   * The UI contradicted the rule the server was actually applying.
   *
   * resolveWorkspaceId verifies membership server-side and falls back to the
   * caller's own workspace, so a forged header cannot borrow someone's plan.
   */
  async getAppStatus(userId, requestedWorkspaceId = null) {
    const workspaceId = await resolveWorkspaceId(userId, requestedWorkspaceId);
    // Entitlements and quotas belong to the WORKSPACE OWNER — Pro flow limits
    // and the flow count are a shared allowance, so they are read from that
    // row even when the caller is a member.
    //
    // `currentVersion` is NOT one of those. It answers "which app is THIS
    // PERSON looking at right now?" — a per-caller session fact — so it must
    // come from the CALLER's row. Reading it off the owner caused an infinite
    // reload loop for any member inside someone else's workspace: the member
    // switched to Pro (their own currentVersion → "pro"), the page reloaded
    // with X-Workspace-Context set to the owner, this endpoint reported the
    // OWNER's currentVersion ("free"), and DashboardLayout's reconcile effect
    // saw currentApp !== target, switched again and reloaded — forever, one
    // switch-app PUT and one full page load every ~6 seconds.
    const [user, caller] = await Promise.all([
      prisma.user.findUnique({
        where: { id: workspaceId },
        select: {
          hasPro: true,
          proPurchasedAt: true,
          proFlowLimit: true,
          proAdditionalFlowsPurchased: true,
          proUnlimitedFlows: true,
          currentVersion: true,
          stripeCustomerId: true,
          flowAddonStatus: true,
          flowAddonPlan: true,
          flowAddonCurrentPeriodEnd: true,
        },
      }),
      workspaceId === userId
        ? null
        : prisma.user.findUnique({
            where: { id: userId },
            select: { currentVersion: true },
          }),
    ]);
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
    // Own workspace → `caller` is null and `user` IS the caller.
    const callerCurrentVersion = (caller || user).currentVersion;

    let proFlowsUsed = 0;
    if (user.hasPro) {
      // Count only flows visible in the PRO app. Under owner-as-workspace
      // (2026-08-07) the workspace is the user themself and the app boundary
      // moved onto appContext — so this is simply "my workspace, pro app".
      // The old version had to locate a hidden Pro team and match its id;
      // Team-app flows are excluded by appContext instead of by team.
      proFlowsUsed = await prisma.flow.count({
        where: {
          // The WORKSPACE's pro flows — shared allowance, shared count.
          workspaceId,
          deletedAt: null,
          appContext: "pro",
        },
      });
    }

    // Flow pack addon is active only when status=active AND period end is in the future.
    // proUnlimitedFlows is set alongside the addon purchase — honour it only while
    // the addon is still live (avoids stale unlimited access after pack expiry).
    const isAddonActive =
      user.flowAddonStatus === "active" &&
      (!user.flowAddonCurrentPeriodEnd ||
        new Date(user.flowAddonCurrentPeriodEnd) > new Date());
    const isAddonUnlimited =
      isAddonActive && user.flowAddonPlan === "unlimited";
    const isUnlimited =
      (user.proUnlimitedFlows && isAddonActive) || isAddonUnlimited;
    const maxFlows =
      isAddonActive && user.flowAddonPlan === "standard_100"
        ? 100
        : (user.proFlowLimit ?? 0) + (user.proAdditionalFlowsPurchased ?? 0);

    // One-time flow-pack purchase history (lifecycle: active/grace/expired/renewed).
    // Only queried when the user has ever purchased Pro — free users can't have rows.
    const flowPackPurchases = user.hasPro
      ? await prisma.proFlowPurchase.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            flowCount: true,
            amountCents: true,
            packType: true,
            isUnlimited: true,
            status: true,
            expiresAt: true,
            gracePeriodEndsAt: true,
            createdAt: true,
          },
        })
      : [];

    return {
      currentApp: callerCurrentVersion || "free",
      hasPro: user.hasPro,
      proPurchasedAt: user.proPurchasedAt,
      isUnlimited,
      flowAddonStatus: user.flowAddonStatus || null,
      flowAddonPlan: user.flowAddonPlan || null,
      flowAddonCurrentPeriodEnd: user.flowAddonCurrentPeriodEnd || null,
      proFlows: {
        used: proFlowsUsed,
        max: isUnlimited ? -1 : maxFlows,
        baseLimit: user.proFlowLimit ?? 0,
        extraPurchased: user.proAdditionalFlowsPurchased ?? 0,
      },
      flowPackPurchases,
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

    // Check if already activated.
    // IMPORTANT: check proPurchasedAt, NOT hasPro.
    // hasPro can be true from admin team grants without a real Pro purchase.
    // Only skip activation if the user has explicitly purchased Pro ($1 product).
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { hasPro: true, proPurchasedAt: true },
    });

    if (user?.proPurchasedAt) {
      console.log(
        "[ProService.verifyPurchase] Already active for user:",
        userId,
      );
      // Backfill: a user activated before this fix may still be missing
      // their Pro team (bug-056). Ensure it exists even on the fast path.
      await this._ensureProTeam(userId);
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
        isLegacyPro: false,
      },
    });

    // Bug-056: the Pro workspace team must exist before the user ever hits
    // the Pro dashboard, or getAppStatus() falls back to counting their
    // personal (workspaceId:null) flows as Pro usage.
    await this._ensureProTeam(userId);

    // Grant 50 LIFETIME AI credits for new Pro ($5) — idempotent, webhook may
    // also do this. planResetsAt=null: Pro credits never refill (one-time
    // lifetime purchase, not a monthly allowance) — same on web + mobile (bug-087).
    await prisma.aiCreditBalance.upsert({
      where: { userId_appContext: { userId, appContext: "pro" } },
      create: {
        userId,
        planCredits: 50,
        addonCredits: 0,
        planResetsAt: null,
        appContext: "pro",
      },
      update: {
        planCredits: 50,
        planResetsAt: null,
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
          appContext: "pro",
          // bug-030: tag so a later charge.refunded can match & revoke Pro.
          purchaseType: "pro_upgrade",
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
            "Purchase Pro ($5 one-time) to access this app. Redirecting to checkout.",
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
            unit_amount: PRO_LIFETIME_PRICE_CENTS, // $5.00 one-time
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
      // BUG-PAY-002: save card for future charges after one-time payment
      payment_intent_data: { setup_future_usage: "off_session" },
      // Stripe Adaptive Pricing (account-level setting) converts to local currency
      success_url: `${baseUrl}/payment-return.html?redirect=%2Fsubscription%2Fsuccess&type=pro&plan=ValueCharts%2BPro&app_context=pro&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/upgrade-pro?cancelled=true`,
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
        flowAddonStatus: true,
      },
    });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
    if (!user.hasPro) {
      throw new AppError("Pro access required", 403, "PRO_REQUIRED");
    }
    // A recurring flow add-on (System B) already covers extra flows — block
    // the one-time pack to prevent double billing and conflicting
    // entitlements ('cancelling' still has paid access until period end).
    if (
      user.flowAddonStatus === "active" ||
      user.flowAddonStatus === "cancelling"
    ) {
      throw new AppError(
        "You have an active monthly flow add-on subscription. Manage it from the subscription page.",
        400,
        "ADDON_SUBSCRIPTION_ACTIVE",
      );
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
    const flowCount = isUnlimited ? -1 : 100;
    const productName = isUnlimited
      ? "Unlimited Flows"
      : "Standard Flow Pack (100 Flows)";
    const description = isUnlimited
      ? "Unlimited Flows for ValueChart Pro — 30-day pack (one-time charge)"
      : "100 Additional Flows for ValueChart Pro — 30-day pack (one-time charge)";

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
      // BUG-PAY-002: save card for future charges after one-time payment
      payment_intent_data: { setup_future_usage: "off_session" },
      // Stripe Adaptive Pricing (account-level setting) converts to local currency
      // session_id is needed by the success page to call the verify-purchase
      // fallback when the Stripe webhook hasn't reached the backend yet
      // (common in local dev without `stripe listen`).
      success_url: `${baseUrl}/payment-return.html?redirect=%2Fsubscription%2Fsuccess&type=purchase&plan=${flowPackage}&app_context=pro&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/dashboard/subscription`,
    });

    return { sessionId: session.id, url: session.url };
  }

  async handleProUpgradeWebhook(session) {
    const { grantProCredits } = require("../lib/grantProCredits");

    const userId = session.metadata?.userId;
    logger.info("[handleProUpgradeWebhook] pro_upgrade webhook", {
      userId,
      paymentIntent: session.payment_intent,
    });

    if (!userId) {
      logger.error(
        "[handleProUpgradeWebhook] No userId in metadata — cannot activate Pro",
      );
      return;
    }

    // Idempotency: fetch the user before any writes.
    // If proPurchasedAt is already set this is a duplicate webhook delivery — skip.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { proPurchasedAt: true, name: true, email: true },
    });
    if (!user) {
      logger.error(`[handleProUpgradeWebhook] User not found: ${userId}`);
      return;
    }
    if (user.proPurchasedAt) {
      logger.info(
        `[handleProUpgradeWebhook] Pro already activated for user ${userId}, skipping duplicate webhook`,
      );
      // Backfill: bug-056 — ensure the Pro team exists even on the
      // already-processed path (e.g. the browser's verifyPurchase call won).
      await this._ensureProTeam(userId);
      return { alreadyProcessed: true };
    }

    // Atomic: all core DB writes succeed together or roll back together.
    // Best-effort side effects (email, push, invite) run after the transaction.
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          hasPro: true,
          proPurchasedAt: new Date(),
          currentVersion: "pro",
          isLegacyPro: false,
        },
      });

      await tx.flowShare.updateMany({
        where: { sharedWithId: userId, requiresPro: true },
        data: { requiresPro: false },
      });

      await grantProCredits(
        userId,
        {
          txnId: session.id,
          amountCharged: session.amount_total || 500,
          currency: session.currency || getStripeCurrency(),
          paymentMethod: session.payment_method_types?.[0] || "card",
        },
        tx,
      );

      // Bug-056: create the Pro workspace team in the same transaction so
      // Pro flow-usage never falls back to counting the user's personal
      // (workspaceId:null) flows.
      await this._ensureProTeam(userId, tx);
    });

    logger.info(`[handleProUpgradeWebhook] Pro activated for user ${userId}`);

    // ── Best-effort side effects (non-fatal if these fail) ──────────────────

    // Welcome email
    try {
      const { sendEmail } = require("../utils/email");
      const dashUrl = `${process.env.APP_URL || "http://localhost:3000"}/dashboard`;
      if (user.email) {
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
                <li>50 AI diagram credits per month</li>
                <li>All team features — included</li>
                <li>Unlimited team members</li>
                <li>Team chat</li>
                <li>10 flows included</li>
              </ul>
              <p>Need more flows? Buy a flow pack (100 flows for $10 or unlimited for $20) anytime from your dashboard.</p>
              <p style="margin-top:20px">
                <a href="${dashUrl}" style="background:#3CB371;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">Go to Dashboard</a>
              </p>
              <p style="color:#888;font-size:12px;margin-top:24px">ValueChart Pro — Lifetime Access</p>
            </div>
          `,
        });
      }
    } catch (err) {
      logger.error(`[handleProUpgradeWebhook] Email failed: ${err.message}`);
    }

    // Auto-accept pending team invitation started from an invite link
    const pendingInviteToken = session.metadata?.pendingInviteToken;
    if (pendingInviteToken) {
      try {
        const teamService = require("./team.service");
        const result = await teamService.acceptInvite(
          pendingInviteToken,
          userId,
        );
        logger.info(
          `[handleProUpgradeWebhook] Auto-accepted invite token=${pendingInviteToken} → team=${result?.workspaceId}`,
        );
      } catch (err) {
        logger.error(
          `[handleProUpgradeWebhook] Auto-accept invite failed: ${err.message}`,
        );
      }
    }

    // Push notification
    try {
      const fcm = require("./fcm.service");
      await fcm.sendToUser(
        userId,
        "Welcome to ValueChart Pro!",
        "Your lifetime Pro access is now active.",
        { type: "payment", url: "/dashboard" },
      );
    } catch (err) {
      logger.warn(`[handleProUpgradeWebhook] Push failed: ${err.message}`);
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

    // Clear the over-limit lock so the flows page unlocks immediately.
    await prisma.flowLimit.updateMany({
      where: { userId, appType: "individual" },
      data: {
        overLimitLocked: false,
        overLimitModalShown: false,
        updatedAt: new Date(),
      },
    });

    // Auto-restore flows that were trashed by a prior expiry. Only flows
    // still soft-deleted (deletedAt set) and flagged markedForDowngrade
    // are eligible. Hard-purged trash is unrecoverable.
    let restored = 0;
    if (isRenewal || previousActive) {
      const restoreResult = await prisma.flow.updateMany({
        where: {
          // Flow has no ownerId — the workspace IS the owner.
          workspaceId: userId,
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
        appContext: "pro",
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
        flowAddonStatus: true,
        flowAddonPlan: true,
      },
    });

    if (!user || !user.hasPro || user.currentVersion !== "pro") {
      return { isPro: false };
    }

    // Unlimited via base flag or active unlimited add-on
    const isUnlimited =
      user.proUnlimitedFlows ||
      (user.flowAddonStatus === "active" && user.flowAddonPlan === "unlimited");
    if (isUnlimited) {
      return {
        isPro: true,
        allowed: true,
        used: 0,
        max: -1,
        isUnlimited: true,
      };
    }

    const flowCount = await prisma.flow.count({
      where: { workspaceId: userId, deletedAt: null, appContext: "pro" },
    });

    // Active standard add-on (100 flows) overrides the base limit + one-time packs.
    const maxFlows =
      user.flowAddonStatus === "active" && user.flowAddonPlan === "standard_100"
        ? 100
        : user.proFlowLimit + user.proAdditionalFlowsPurchased;

    if (flowCount >= maxFlows) {
      throw new AppError(
        `Pro flow limit reached. You have used ${flowCount} of ${maxFlows} flows. Purchase additional flows to create more.`,
        403,
        "PRO_FLOW_LIMIT_REACHED",
      );
    }

    return { isPro: true, allowed: true, used: flowCount, max: maxFlows };
  }

  // ── Flow Add-on Subscription ──────────────────────────────────────────────

  async createFlowAddonSubscriptionCheckout(
    userId,
    plan,
    paymentMethodId = null,
  ) {
    if (plan !== "standard" && plan !== "unlimited") {
      throw new AppError(
        'Invalid plan. Use "standard" or "unlimited"',
        400,
        "VALIDATION_ERROR",
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        hasPro: true,
        proPurchasedAt: true,
        email: true,
        stripeCustomerId: true,
        flowAddonStatus: true,
        flowAddonPlan: true,
        flowAddonStripeSubId: true,
      },
    });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
    if (!user.hasPro || !user.proPurchasedAt) {
      throw new AppError(
        "Pro Base purchase required before adding a flow subscription",
        400,
        "PRO_REQUIRED",
      );
    }
    const requestedPlan = plan === "unlimited" ? "unlimited" : "standard_100";
    if (user.flowAddonStatus === "active") {
      // standard_100 → unlimited: in-place Stripe price swap, no new checkout.
      if (
        user.flowAddonPlan === "standard_100" &&
        requestedPlan === "unlimited"
      ) {
        return await this.upgradeFlowAddon(userId, user);
      }
      if (
        user.flowAddonPlan === "unlimited" &&
        requestedPlan === "standard_100"
      ) {
        throw new AppError(
          "To downgrade, cancel your current plan and resubscribe after it ends",
          400,
          "DOWNGRADE_NOT_ALLOWED",
        );
      }
      // Same plan — or an unknown stored plan — stays blocked.
      throw new AppError(
        "You already have an active flow add-on subscription",
        400,
        "ALREADY_SUBSCRIBED",
      );
    }

    // "cancelling" still has a live Stripe subscription until period end —
    // falling through to the new-subscription paths below would create a
    // SECOND addon sub (double billing) and orphan the old one (bug-048).
    // Route to the existing sub instead: upgrade applies in place (and
    // clears the pending cancel, bug-049); re-picking the same plan is an
    // unambiguous "I'm staying" → reactivate (mirror of Team bug-045).
    if (user.flowAddonStatus === "cancelling" && user.flowAddonStripeSubId) {
      if (
        user.flowAddonPlan === "standard_100" &&
        requestedPlan === "unlimited"
      ) {
        return await this.upgradeFlowAddon(userId, user);
      }
      if (user.flowAddonPlan === requestedPlan) {
        return await this.reactivateFlowAddon(userId);
      }
      throw new AppError(
        "To downgrade, let your current plan end and resubscribe after",
        400,
        "DOWNGRADE_NOT_ALLOWED",
      );
    }

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

    const priceId =
      plan === "unlimited"
        ? getStripePrice(
            "STRIPE_TEST_FLOW_UNLIMITED_PRICE_ID",
            "STRIPE_LIVE_FLOW_UNLIMITED_PRICE_ID",
            "STRIPE_FLOW_UNLIMITED_PRICE_ID",
          )
        : getStripePrice(
            "STRIPE_TEST_FLOW_STANDARD_PRICE_ID",
            "STRIPE_LIVE_FLOW_STANDARD_PRICE_ID",
            "STRIPE_FLOW_STANDARD_PRICE_ID",
          );
    if (!priceId) {
      throw new AppError(
        `Stripe price ID for flow_${plan} not configured`,
        503,
        "CONFIG_ERROR",
      );
    }

    const addonPlan = plan === "unlimited" ? "unlimited" : "standard_100";

    // Direct charge with saved card — no Stripe redirect needed.
    // off_session + error_if_incomplete: Stripe immediately charges the card
    // and throws a StripeCardError on failure (same pattern as subscription
    // plan-change in subscription.service.js). Subscription is "active" on
    // return if the charge succeeded.
    if (paymentMethodId) {
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        default_payment_method: paymentMethodId,
        off_session: true,
        payment_behavior: "error_if_incomplete",
        metadata: { purchaseType: "flow_addon", userId, plan: addonPlan },
        expand: ["latest_invoice", "items.data"],
      });

      const latestInvoice =
        typeof subscription.latest_invoice === "object" &&
        subscription.latest_invoice !== null
          ? subscription.latest_invoice
          : null;
      const amountCharged = latestInvoice?.amount_paid ?? 0;
      const chargeId =
        typeof latestInvoice?.charge === "string" ? latestInvoice.charge : null;
      const periodEnd = getSubscriptionPeriodEnd(subscription);

      await prisma.user.update({
        where: { id: userId },
        data: {
          flowAddonStatus: "active",
          flowAddonPlan: addonPlan,
          flowAddonStripeSubId: subscription.id,
          isInFlowPickerPhase: false,
          // bug-037: mirror handleFlowAddonCheckoutWebhook's userUpdateData —
          // without these, proUnlimitedFlows/proFlowLimit never reflect the
          // addon, so any code reading them directly (e.g. flow.service.js
          // getPackStatus) sees a false "not unlimited" / stale base limit.
          ...(addonPlan === "standard_100"
            ? { proFlowLimit: 100, proUnlimitedFlows: false }
            : { proUnlimitedFlows: true }),
          ...(periodEnd
            ? { flowAddonCurrentPeriodEnd: new Date(periodEnd * 1000) }
            : {}),
        },
      });

      // Auto-restore flows flagged by a prior cancellation/expiry, and clear
      // the over-limit lock so the flows page unlocks immediately — same
      // side effects as handleFlowAddonCheckoutWebhook (see bug-036: this
      // direct-charge path was missing both, leaving the flows page locked
      // after a saved-card purchase).
      await prisma.flow.updateMany({
        where: { workspaceId: userId, markedForDowngrade: true },
        data: { markedForDowngrade: false, deletedAt: null },
      });
      // Same fix as handleFlowAddonCheckoutWebhook: updateMany() silently
      // no-ops if flow_limits isn't provisioned for this user yet, losing
      // the grant with no error. Find-then-create-or-update instead.
      const existingLimitDirect = await prisma.flowLimit.findFirst({
        where: { userId, appType: "individual" },
      });
      const flowLimitDataDirect = {
        overLimitLocked: false,
        overLimitModalShown: false,
        totCount: addonPlan === "standard_100" ? 100 : null,
        updatedAt: new Date(),
      };
      if (existingLimitDirect) {
        await prisma.flowLimit.update({
          where: { id: existingLimitDirect.id },
          data: flowLimitDataDirect,
        });
      } else {
        await prisma.flowLimit.create({
          data: {
            userId,
            appType: "individual",
            flowUsed: 0,
            ...flowLimitDataDirect,
          },
        });
      }

      await prisma.transactionLog.create({
        data: {
          userId,
          chargeId: chargeId || subscription.id,
          txnId: subscription.id,
          amountCharged,
          currency: subscription.currency || getStripeCurrency(),
          status: "success",
          paymentMethod: "card",
          appType: "individual",
          appContext: "pro",
          purchaseType: "flow_addon",
        },
      });

      await logFlowAddonHistory(userId, {
        plan: addonPlan,
        status: "active",
        reason: "subscribed",
        startedAt: new Date(),
        expiresAt: periodEnd ? new Date(periodEnd * 1000) : null,
      });

      return { subscribed: true };
    }

    // Hosted Stripe checkout (new card path).
    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { purchaseType: "flow_addon", userId, plan: addonPlan },
      // session_id lets the success page call the verify-flow-addon safety
      // net when the Stripe webhook hasn't reached the backend yet.
      success_url: `${baseUrl}/payment-return.html?redirect=%2Fsubscription%2Fsuccess&type=addon&plan=${addonPlan}&app_context=pro&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/dashboard/subscription`,
    });

    return { sessionId: session.id, url: session.url };
  }

  // Upgrade an active standard_100 add-on to unlimited by swapping the price
  // on the existing Stripe subscription (prorated). The DB is updated
  // immediately; the customer.subscription.updated webhook just re-syncs.
  async upgradeFlowAddon(userId, user) {
    if (!user.flowAddonStripeSubId) {
      throw new AppError(
        "No Stripe subscription found for the active add-on",
        500,
        "ADDON_SUB_MISSING",
      );
    }
    const priceId = getStripePrice(
      "STRIPE_TEST_FLOW_UNLIMITED_PRICE_ID",
      "STRIPE_LIVE_FLOW_UNLIMITED_PRICE_ID",
      "STRIPE_FLOW_UNLIMITED_PRICE_ID",
    );
    if (!priceId) {
      throw new AppError(
        "Stripe price ID for flow_unlimited not configured",
        503,
        "CONFIG_ERROR",
      );
    }

    // Paying to upgrade while a cancel is pending is an unambiguous "I'm
    // staying" — clear the cancel in the same update, or the paid upgrade
    // silently dies at period end (bug-049, mirror of Team bug-042).
    const wasCancelling = user.flowAddonStatus === "cancelling";

    const stripe = getStripe();
    const stripeSub = await stripe.subscriptions.retrieve(
      user.flowAddonStripeSubId,
    );
    const updatedSub = await stripe.subscriptions.update(
      user.flowAddonStripeSubId,
      {
        items: [{ id: stripeSub.items.data[0].id, price: priceId }],
        proration_behavior: "create_prorations",
        metadata: { purchaseType: "flow_addon", userId, plan: "unlimited" },
        ...(wasCancelling ? { cancel_at_period_end: false } : {}),
      },
    );

    const upgradePeriodEnd = getSubscriptionPeriodEnd(updatedSub);
    await prisma.user.update({
      where: { id: userId },
      data: {
        flowAddonPlan: "unlimited",
        proUnlimitedFlows: true,
        ...(wasCancelling ? { flowAddonStatus: "active" } : {}),
        ...(upgradePeriodEnd
          ? {
              flowAddonCurrentPeriodEnd: new Date(upgradePeriodEnd * 1000),
            }
          : {}),
      },
    });

    await logFlowAddonHistory(userId, {
      plan: "unlimited",
      status: "active",
      reason: "upgraded",
      startedAt: new Date(),
      expiresAt: upgradePeriodEnd ? new Date(upgradePeriodEnd * 1000) : null,
    });

    logger.info(
      `[upgradeFlowAddon] user=${userId} upgraded standard_100 → unlimited`,
    );
    return {
      upgraded: true,
      plan: "unlimited",
      message: "Upgraded to Unlimited Flows successfully",
    };
  }

  // Safety net for a lost flow_addon checkout webhook — mirror of
  // verifyExtraFlowsPurchase. Idempotent: handleFlowAddonCheckoutWebhook
  // dedupes on TransactionLog.txnId === session.id.
  async verifyFlowAddonCheckout(userId, sessionId) {
    if (!sessionId) {
      throw new AppError("Missing session_id", 400, "MISSING_SESSION_ID");
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
    if (session.metadata?.purchaseType !== "flow_addon") {
      throw new AppError(
        "Not a flow add-on checkout session",
        400,
        "INVALID_SESSION",
      );
    }

    const existingTxn = await prisma.transactionLog.findFirst({
      where: { txnId: session.id },
    });
    if (existingTxn) {
      return { verified: true, alreadyActive: true };
    }

    // Webhook never arrived — activate using the same logic it would run.
    await this.handleFlowAddonCheckoutWebhook(session);
    logger.info(
      `[verifyFlowAddonCheckout] Activated via safety net for user ${userId} (session ${session.id})`,
    );
    return { verified: true, alreadyActive: false };
  }

  async handleFlowAddonCheckoutWebhook(session) {
    const { userId, plan: addonPlan } = session.metadata;
    if (!userId || !addonPlan) {
      logger.error(
        "[handleFlowAddonCheckoutWebhook] Missing userId or plan in metadata",
      );
      return;
    }

    // Idempotency
    const existingTxn = await prisma.transactionLog.findFirst({
      where: { txnId: session.id },
    });
    if (existingTxn) {
      logger.info(
        `[handleFlowAddonCheckoutWebhook] Session ${session.id} already processed`,
      );
      return;
    }

    const stripe = getStripe();
    let periodEnd = null;
    if (session.subscription) {
      try {
        const stripeSub = await stripe.subscriptions.retrieve(
          session.subscription,
          { expand: ["items.data"] },
        );
        const rawPeriodEnd = getSubscriptionPeriodEnd(stripeSub);
        periodEnd = rawPeriodEnd ? new Date(rawPeriodEnd * 1000) : null;
      } catch (err) {
        logger.warn(
          `[handleFlowAddonCheckoutWebhook] Failed to retrieve sub: ${err.message}`,
        );
      }
    }

    const userUpdateData = {
      flowAddonStripeSubId: session.subscription,
      flowAddonPlan: addonPlan,
      flowAddonStatus: "active",
      flowAddonCurrentPeriodEnd: periodEnd,
      // Re-subscribing ends any pending flow-picker obligation.
      isInFlowPickerPhase: false,
    };
    if (addonPlan === "standard_100") {
      userUpdateData.proFlowLimit = 100;
      userUpdateData.proUnlimitedFlows = false;
    } else {
      // unlimited
      userUpdateData.proUnlimitedFlows = true;
    }

    let restored = 0;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: userUpdateData });

      // Auto-restore flows flagged by a prior cancellation/expiry (mirror of
      // handleExtraFlowsWebhook). Covers both picker-pending flows (deletedAt
      // null) and ones already trashed by the picker — anything hard-purged
      // (30+ days in trash) is gone and unrecoverable.
      const restoreResult = await tx.flow.updateMany({
        where: { workspaceId: userId, markedForDowngrade: true },
        data: { markedForDowngrade: false, deletedAt: null },
      });
      restored = restoreResult.count;

      // Clear the over-limit lock so the flows page unlocks immediately.
      //
      // bug-XXX: was `flowLimit.updateMany()`, which silently updates ZERO
      // rows (no error) if this user's flow_limits row for "individual"
      // hasn't been provisioned yet — losing the addon grant entirely with
      // no signal, and permanently, since the idempotency check above keys
      // on the Apple/Stripe transaction id and will never retry this once
      // transactionLog has the row. Find-then-create-or-update instead, so
      // the grant always lands regardless of provisioning order. There's no
      // @@unique([userId, appType]) on FlowLimit yet, so this can't use
      // Prisma's upsert() directly.
      const existingLimit = await tx.flowLimit.findFirst({
        where: { userId, appType: "individual" },
      });
      const flowLimitData = {
        overLimitLocked: false,
        overLimitModalShown: false,
        totCount: addonPlan === "standard_100" ? 100 : null,
        updatedAt: new Date(),
      };
      if (existingLimit) {
        await tx.flowLimit.update({
          where: { id: existingLimit.id },
          data: flowLimitData,
        });
      } else {
        await tx.flowLimit.create({
          data: { userId, appType: "individual", flowUsed: 0, ...flowLimitData },
        });
      }

      await tx.transactionLog.create({
        data: {
          userId,
          txnId: session.id,
          chargeId:
            session.payment_intent || session.subscription || session.id,
          amountCharged: session.amount_total || 0,
          currency: session.currency || getStripeCurrency(),
          status: "success",
          paymentMethod: session.payment_method_types?.[0] || "card",
          appType: "individual",
          appContext: "pro",
          purchaseType: "flow_addon",
        },
      });
    });

    if (restored > 0) {
      logger.info(
        `[handleFlowAddonCheckoutWebhook] Restored ${restored} downgrade-flagged flows for user ${userId}`,
      );
    }

    await logFlowAddonHistory(userId, {
      plan: addonPlan,
      status: "active",
      reason: "subscribed",
      startedAt: new Date(),
      expiresAt: periodEnd,
    });

    logger.info(
      `[handleFlowAddonCheckoutWebhook] Activated ${addonPlan} for user ${userId}`,
    );
  }

  async handleFlowAddonSubscriptionUpdated(userId, status, currentPeriodEnd) {
    const addonStatus =
      status === "active"
        ? "active"
        : status === "past_due"
          ? "past_due"
          : status === "canceled"
            ? "cancelled"
            : status;

    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { flowAddonStatus: true, flowAddonPlan: true },
    });

    // Payment failed → start a 3-day grace window before entitlements drop.
    // Stripe dunning usually recovers within that window; the daily cron
    // (checkPastDueGrace) enforces the reduction if it doesn't.
    if (addonStatus === "past_due") {
      await prisma.user.update({
        where: { id: userId },
        data: {
          flowAddonStatus: "past_due",
          flowAddonGracePeriodEnd: new Date(Date.now() + 3 * 24 * 3600 * 1000),
          ...(currentPeriodEnd
            ? { flowAddonCurrentPeriodEnd: new Date(currentPeriodEnd * 1000) }
            : {}),
        },
      });
      try {
        const notificationService = require("./notification.service");
        await notificationService.createNotification(
          userId,
          "flow_addon_payment_failed",
          "Payment failed — flow pack at risk",
          "Your flow add-on payment failed. Update your payment method within 3 days to keep your flows.",
          "/dashboard/subscription",
          { plan: current?.flowAddonPlan },
          "pro", // flow add-on is a personal Pro-tier entitlement — not team-scoped
          null,
        );
      } catch (err) {
        logger.warn(
          `[handleFlowAddonSubscriptionUpdated] past_due notify failed: ${err.message}`,
        );
      }
      await logFlowAddonHistory(userId, {
        plan: current?.flowAddonPlan,
        status: "past_due",
        reason: "payment_failed",
        expiresAt: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
      });
      logger.info(
        `[handleFlowAddonSubscriptionUpdated] user=${userId} past_due — 3-day grace started`,
      );
      return;
    }

    // Recovered from past_due → clear grace and restore plan entitlements
    // (in case the grace cron already reduced them).
    if (addonStatus === "active" && current?.flowAddonStatus === "past_due") {
      await prisma.user.update({
        where: { id: userId },
        data: {
          flowAddonStatus: "active",
          flowAddonGracePeriodEnd: null,
          ...(current.flowAddonPlan === "standard_100"
            ? { proFlowLimit: 100, proUnlimitedFlows: false }
            : current.flowAddonPlan === "unlimited"
              ? { proUnlimitedFlows: true }
              : {}),
          ...(currentPeriodEnd
            ? { flowAddonCurrentPeriodEnd: new Date(currentPeriodEnd * 1000) }
            : {}),
        },
      });
      await logFlowAddonHistory(userId, {
        plan: current.flowAddonPlan,
        status: "active",
        reason: "recovered",
        expiresAt: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
      });
      logger.info(
        `[handleFlowAddonSubscriptionUpdated] user=${userId} recovered from past_due — entitlements restored`,
      );
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        flowAddonStatus: addonStatus,
        ...(addonStatus === "active" ? { flowAddonGracePeriodEnd: null } : {}),
        ...(currentPeriodEnd
          ? { flowAddonCurrentPeriodEnd: new Date(currentPeriodEnd * 1000) }
          : {}),
      },
    });
    // Generic status transitions not covered above (e.g. Stripe reporting
    // "canceled" via customer.subscription.updated before .deleted fires).
    if (addonStatus !== current?.flowAddonStatus) {
      await logFlowAddonHistory(userId, {
        plan: current?.flowAddonPlan,
        status: addonStatus,
        reason: addonStatus,
        expiresAt: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
      });
    }
    logger.info(
      `[handleFlowAddonSubscriptionUpdated] user=${userId} status=${addonStatus}`,
    );
  }

  async handleFlowAddonSubscriptionDeleted(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, flowAddonPlan: true },
    });
    if (!user) return;

    // Unified scope (FLOWPACK Gap #4): same definition of "personal flows"
    // as createFlow, getPackStatus, and the expiry cron — workspaceId=null plus
    // owned teams, never appContext alone.
    const personalScopeOr = await personalFlowTeamOr(user.id);

    await prisma.$transaction(async (tx) => {
      // Revert flow limits to base Pro
      await tx.user.update({
        where: { id: user.id },
        data: {
          flowAddonStatus: "cancelled",
          flowAddonStripeSubId: null,
          flowAddonPlan: null,
          flowAddonCurrentPeriodEnd: null,
          flowAddonGracePeriodEnd: null,
          proFlowLimit: 10,
          proUnlimitedFlows: false,
        },
      });

      // Mark excess flows for downgrade when user has > 10 personal flows
      const flowCount = await tx.flow.count({
        where: { workspaceId: user.id, deletedAt: null, OR: personalScopeOr },
      });
      if (flowCount > 10) {
        await tx.user.update({
          where: { id: user.id },
          data: { isInFlowPickerPhase: true },
        });
        // Mark the flows beyond the 10 most-recently-updated as needing selection
        const excess = await tx.flow.findMany({
          where: { workspaceId: user.id, deletedAt: null, OR: personalScopeOr },
          orderBy: { updatedAt: "desc" },
          skip: 10,
          select: { id: true },
        });
        if (excess.length > 0) {
          await setDowngradeFlagByIds(
            tx,
            excess.map((f) => f.id),
            true,
          );
        }
      }
    });

    await logFlowAddonHistory(userId, {
      plan: user.flowAddonPlan,
      status: "cancelled",
      reason: "cancelled",
    });

    logger.info(
      `[handleFlowAddonSubscriptionDeleted] Reverted flow limits for user ${user.id}`,
    );

    // Best-effort cancellation email
    try {
      const { sendEmail } = require("../utils/email");
      const dashUrl = `${process.env.APP_URL || "http://localhost:3000"}/dashboard/subscription`;
      if (user.email) {
        await sendEmail({
          to: user.email,
          subject: "Your Flow Add-on subscription has ended — ValueChart Pro",
          html: `
            <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1A1A2E">
              <h2 style="color:#1A1A2E;margin:0 0 12px">Flow Add-on subscription ended</h2>
              <p>Hi ${user.name || "there"},</p>
              <p>Your recurring Flow Add-on subscription has been cancelled. Your flow limit has reverted to the base 10 flows included with Pro.</p>
              <p>You can resubscribe anytime from your subscription page.</p>
              <p style="margin-top:20px">
                <a href="${dashUrl}" style="background:#3CB371;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">Manage Subscription</a>
              </p>
            </div>`,
        });
      }
    } catch (err) {
      logger.warn(
        `[handleFlowAddonSubscriptionDeleted] Email failed: ${err.message}`,
      );
    }
  }

  async cancelFlowAddon(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        flowAddonStripeSubId: true,
        flowAddonStatus: true,
        flowAddonPlan: true,
      },
    });
    if (!user?.flowAddonStripeSubId || user.flowAddonStatus !== "active") {
      throw new AppError(
        "No active flow add-on subscription to cancel",
        400,
        "NO_ACTIVE_ADDON",
      );
    }

    const stripe = getStripe();
    // Cancel at period end — user keeps access until billing cycle ends
    await stripe.subscriptions.update(user.flowAddonStripeSubId, {
      cancel_at_period_end: true,
    });

    await prisma.user.update({
      where: { id: userId },
      data: { flowAddonStatus: "cancelling" },
    });

    await logFlowAddonHistory(userId, {
      plan: user.flowAddonPlan,
      status: "cancelling",
      reason: "cancel_requested",
    });

    return {
      message:
        "Flow add-on will cancel at the end of the current billing period",
    };
  }

  // Undo a pending cancel before period end (bug-047) — mirror of the Team
  // plan's reactivateSubscription. No charge; the addon simply resumes
  // renewing as normal.
  async reactivateFlowAddon(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        flowAddonStripeSubId: true,
        flowAddonStatus: true,
        flowAddonPlan: true,
      },
    });
    if (!user?.flowAddonStripeSubId) {
      throw new AppError(
        "No flow add-on subscription to reactivate",
        400,
        "NO_ADDON_SUB",
      );
    }
    if (user.flowAddonStatus !== "cancelling") {
      throw new AppError(
        "Flow add-on is not in cancelling state",
        400,
        "NOT_CANCELLING",
      );
    }

    const stripe = getStripe();
    await stripe.subscriptions.update(user.flowAddonStripeSubId, {
      cancel_at_period_end: false,
    });

    await prisma.user.update({
      where: { id: userId },
      data: { flowAddonStatus: "active" },
    });

    await logFlowAddonHistory(userId, {
      plan: user.flowAddonPlan,
      status: "active",
      reason: "reactivated",
    });

    logger.info(`[reactivateFlowAddon] user=${userId} addon reactivated`);
    return {
      reactivated: true,
      message: "Flow add-on reactivated — it will renew as normal",
    };
  }

  async getFlowAddonStatus(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        flowAddonStripeSubId: true,
        flowAddonPlan: true,
        flowAddonStatus: true,
        flowAddonCurrentPeriodEnd: true,
      },
    });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
    return {
      stripeSubId: user.flowAddonStripeSubId,
      plan: user.flowAddonPlan,
      status: user.flowAddonStatus,
      currentPeriodEnd: user.flowAddonCurrentPeriodEnd,
    };
  }

  getFlowPricing() {
    return [
      {
        package: "50",
        flowCount: 100,
        amountCents: 1000,
        amountDisplay: "$10.00",
        description: "100 flows, monthly subscription",
      },
      {
        package: "unlimited",
        flowCount: -1,
        amountCents: 2000,
        amountDisplay: "$20.00",
        description: "Never worry about flow limits again",
      },
    ];
  }

  // Same inheritance rule as getAppStatus — see the comment there.
  async getProSubscriptionStatus(userId, requestedWorkspaceId = null) {
    const workspaceId = await resolveWorkspaceId(userId, requestedWorkspaceId);
    const user = await prisma.user.findUnique({
      where: { id: workspaceId },
      select: {
        hasPro: true,
        proFlowLimit: true,
        proAdditionalFlowsPurchased: true,
        proUnlimitedFlows: true,
        flowAddonStripeSubId: true,
        flowAddonPlan: true,
        flowAddonStatus: true,
        flowAddonCurrentPeriodEnd: true,
      },
    });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
    if (!user.hasPro) {
      throw new AppError("Pro access required", 403, "PRO_REQUIRED");
    }

    // Count only flows visible in the Pro app, matching getAppStatus and
    // getPackStatus so all three display the same number.
    //
    // owner-as-workspace (2026-08-07): Pro flows live in the user's OWN
    // workspace under `appContext: "pro"` — there is no hidden Pro team any
    // more. This still looked the team up and scoped by `workspaceId: team.id`
    // (a team id where a user id belongs) AND filtered on `ownerId`, a column
    // Flow no longer has — so the whole endpoint 500'd with a Prisma validation
    // error and the Subscription page rendered "Could not load Pro plan".
    const flowCount = await prisma.flow.count({
      where: {
        workspaceId,
        appContext: "pro",
        deletedAt: null,
      },
    });

    const isAddonActive =
      user.flowAddonStatus === "active" &&
      (!user.flowAddonCurrentPeriodEnd ||
        new Date(user.flowAddonCurrentPeriodEnd) > new Date());
    const isAddonUnlimited =
      isAddonActive && user.flowAddonPlan === "unlimited";
    const effectiveUnlimited = user.proUnlimitedFlows || isAddonUnlimited;
    const effectiveLimit =
      isAddonActive && user.flowAddonPlan === "standard_100"
        ? 100
        : user.proFlowLimit + user.proAdditionalFlowsPurchased;
    const totalFlows = effectiveUnlimited ? -1 : effectiveLimit;
    const remaining = effectiveUnlimited ? -1 : totalFlows - flowCount;

    const purchases = await prisma.proFlowPurchase.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return {
      plan: "Pro",
      originalPrice: "$5",
      isUnlimited: effectiveUnlimited,
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
      flowAddon: {
        plan: user.flowAddonPlan,
        status: user.flowAddonStatus,
        currentPeriodEnd: user.flowAddonCurrentPeriodEnd,
      },
    };
  }
}

module.exports = new ProService();
module.exports.getSubscriptionPeriodEnd = getSubscriptionPeriodEnd;
module.exports.logFlowAddonHistory = logFlowAddonHistory;
