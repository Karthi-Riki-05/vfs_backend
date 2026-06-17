const { prisma } = require("../lib/prisma");
const {
  getStripe,
  getStripeCurrency,
  getStripePrice,
} = require("../lib/stripe");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const { personalFlowTeamOr } = require("../lib/personalFlowScope");

const FLOW_PRICING = {
  50: 1000, // $10.00/month — Standard (100 flows)
  unlimited: 2000, // $20.00/month — Unlimited
};

class ProService {
  /**
   * Grant Pro from the mobile app (Flutter WebView), with NO Stripe charge.
   * The purchase already happened in the App Store / Play Store, so this is
   * called automatically by ProGuard once a `?app=pro` user is authenticated.
   *
   * Provisions three things atomically and idempotently:
   *   1. 200 lifetime Pro AI credits (appContext='pro', planResetsAt=NULL —
   *      Pro never refills; see aiCredit.service getOrCreateBalance).
   *   2. User promotion: hasPro=true, currentVersion='pro', proPurchasedAt set.
   *   3. The user's own Pro team (appContext='pro') so Pro flows get a stable
   *      teamId workspace instead of NULL.
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
      // 1. Pro AI credits — 200 lifetime, never resets. `update: {}` keeps any
      //    existing balance/addons intact so a re-grant can never double them.
      await tx.aiCreditBalance.upsert({
        where: { userId_appContext: { userId, appContext: "pro" } },
        create: {
          userId,
          appContext: "pro",
          planCredits: 200,
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
      await tx.teamMember.create({
        data: { teamId: team.id, userId, role: "OWNER" },
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
      planCredits: 200,
      planResetsAt: null,
      proTeamId: proTeam.id,
      proTeamName: proTeam.name,
      message: "Pro granted successfully",
    };
  }

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
        flowAddonStatus: true,
        flowAddonPlan: true,
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
      // Unified scope (FLOWPACK Gap #4) — same count the createFlow limit
      // check enforces, so "used" never disagrees with creation errors.
      proFlowsUsed = await prisma.flow.count({
        where: {
          ownerId: userId,
          deletedAt: null,
          OR: await personalFlowTeamOr(userId),
        },
      });
    }

    const isAddonUnlimited =
      user.flowAddonStatus === "active" && user.flowAddonPlan === "unlimited";
    const isUnlimited = user.proUnlimitedFlows || isAddonUnlimited;
    const maxFlows =
      user.flowAddonStatus === "active" && user.flowAddonPlan === "standard_100"
        ? 100
        : (user.proFlowLimit ?? 0) + (user.proAdditionalFlowsPurchased ?? 0);

    return {
      currentApp: user.currentVersion || "free",
      hasPro: user.hasPro,
      proPurchasedAt: user.proPurchasedAt,
      isUnlimited,
      proFlows: {
        used: proFlowsUsed,
        max: isUnlimited ? -1 : maxFlows,
        baseLimit: user.proFlowLimit ?? 0,
        extraPurchased: user.proAdditionalFlowsPurchased ?? 0,
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

    // Grant 200 AI credits/month for new Pro ($5) — idempotent, webhook may also do this.
    const nextReset = new Date();
    nextReset.setMonth(nextReset.getMonth() + 1);
    nextReset.setDate(1);
    nextReset.setHours(0, 0, 0, 0);
    await prisma.aiCreditBalance.upsert({
      where: { userId_appContext: { userId, appContext: "pro" } },
      create: {
        userId,
        planCredits: 200,
        addonCredits: 0,
        planResetsAt: nextReset,
        appContext: "pro",
      },
      update: {
        planCredits: 200,
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
          appContext: "pro",
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
            unit_amount: 500, // $5.00 one-time
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
                <li>200 AI diagram credits per month</li>
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
          `[handleProUpgradeWebhook] Auto-accepted invite token=${pendingInviteToken} → team=${result?.teamId}`,
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
      where: { ownerId: userId, deletedAt: null, appContext: "pro" },
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

  async createFlowAddonSubscriptionCheckout(userId, plan) {
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

    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    const addonPlan = plan === "unlimited" ? "unlimited" : "standard_100";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { purchaseType: "flow_addon", userId, plan: addonPlan },
      // session_id lets the success page call the verify-flow-addon safety
      // net when the Stripe webhook hasn't reached the backend yet.
      success_url: `${baseUrl}/dashboard/subscription?flow_addon_subscribed=${addonPlan}&session_id={CHECKOUT_SESSION_ID}`,
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
      },
    );

    await prisma.user.update({
      where: { id: userId },
      data: {
        flowAddonPlan: "unlimited",
        proUnlimitedFlows: true,
        ...(updatedSub.current_period_end
          ? {
              flowAddonCurrentPeriodEnd: new Date(
                updatedSub.current_period_end * 1000,
              ),
            }
          : {}),
      },
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
        );
        periodEnd = stripeSub.current_period_end
          ? new Date(stripeSub.current_period_end * 1000)
          : null;
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
        where: { ownerId: userId, markedForDowngrade: true },
        data: { markedForDowngrade: false, deletedAt: null },
      });
      restored = restoreResult.count;

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
        },
      });
    });

    if (restored > 0) {
      logger.info(
        `[handleFlowAddonCheckoutWebhook] Restored ${restored} downgrade-flagged flows for user ${userId}`,
      );
    }
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
        );
      } catch (err) {
        logger.warn(
          `[handleFlowAddonSubscriptionUpdated] past_due notify failed: ${err.message}`,
        );
      }
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
    logger.info(
      `[handleFlowAddonSubscriptionUpdated] user=${userId} status=${addonStatus}`,
    );
  }

  async handleFlowAddonSubscriptionDeleted(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) return;

    // Unified scope (FLOWPACK Gap #4): same definition of "personal flows"
    // as createFlow, getPackStatus, and the expiry cron — teamId=null plus
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
        where: { ownerId: user.id, deletedAt: null, OR: personalScopeOr },
      });
      if (flowCount > 10) {
        await tx.user.update({
          where: { id: user.id },
          data: { isInFlowPickerPhase: true },
        });
        // Mark the flows beyond the 10 most-recently-updated as needing selection
        const excess = await tx.flow.findMany({
          where: { ownerId: user.id, deletedAt: null, OR: personalScopeOr },
          orderBy: { updatedAt: "desc" },
          skip: 10,
          select: { id: true },
        });
        if (excess.length > 0) {
          await tx.flow.updateMany({
            where: { id: { in: excess.map((f) => f.id) } },
            data: { markedForDowngrade: true },
          });
        }
      }
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
      select: { flowAddonStripeSubId: true, flowAddonStatus: true },
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

    return {
      message:
        "Flow add-on will cancel at the end of the current billing period",
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

  async getProSubscriptionStatus(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
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

    // Unified scope (FLOWPACK Gap #4) — same count the createFlow limit
    // check enforces, so used/remaining never disagree with creation errors.
    const flowCount = await prisma.flow.count({
      where: {
        ownerId: userId,
        deletedAt: null,
        OR: await personalFlowTeamOr(userId),
      },
    });

    const isAddonUnlimited =
      user.flowAddonStatus === "active" && user.flowAddonPlan === "unlimited";
    const effectiveUnlimited = user.proUnlimitedFlows || isAddonUnlimited;
    const effectiveLimit =
      user.flowAddonStatus === "active" && user.flowAddonPlan === "standard_100"
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
