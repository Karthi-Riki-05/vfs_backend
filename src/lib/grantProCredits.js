"use strict";

const { prisma } = require("./prisma");
const logger = require("../utils/logger");

/**
 * Grant 50 Pro AI credits to a user and optionally record a TransactionLog.
 * Idempotent: uses upsert for the credit balance and deduplicates on txnId.
 *
 * Accepts an optional Prisma transaction client so callers inside an existing
 * $transaction can share the same atomic context (no nested transactions).
 * When tx is omitted the helper starts its own transaction.
 *
 * @param {string} userId
 * @param {{ txnId?: string, amountCharged?: number, currency?: string, paymentMethod?: string }} [options]
 * @param {import('@prisma/client').Prisma.TransactionClient|null} [tx]
 */
async function grantProCredits(userId, options = {}, tx = null) {
  const {
    txnId = null,
    amountCharged = 500,
    currency = "usd",
    paymentMethod = "card",
  } = options;

  const _run = async (db) => {
    // Pro = 50 credits LIFETIME on every channel (web + mobile). planResetsAt
    // MUST be null so aiCredit.service never schedules a monthly refill — Pro is
    // a one-time $5 lifetime purchase, not a monthly allowance (bug-087).
    await db.aiCreditBalance.upsert({
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

    // bug-156: carry the buyer's paid add-on credits from their `free` wallet
    // into the new `pro` wallet (Option A — free PLAN credits are not carried).
    // Lazy require avoids a load-order cycle with aiCredit.service.
    const { absorbFreeAddonCredits } = require("../services/aiCredit.service");
    await absorbFreeAddonCredits(db, userId, "pro");

    if (txnId) {
      const existing = await db.transactionLog.findFirst({ where: { txnId } });
      if (!existing) {
        await db.transactionLog.create({
          data: {
            userId,
            chargeId: txnId,
            txnId,
            amountCharged,
            currency,
            status: "success",
            paymentMethod,
            appType: "individual",
            appContext: "pro",
            // bug-030: tag so a later charge.refunded can identify this as the
            // one-time Pro purchase and revoke Pro (vs an AI-credit/flow charge).
            purchaseType: "pro_upgrade",
          },
        });
      }
    }

    logger.info(`[grantProCredits] 50 Pro credits granted to user ${userId}`);
  };

  if (tx) {
    return _run(tx);
  }
  return prisma.$transaction((t) => _run(t));
}

module.exports = { grantProCredits };
