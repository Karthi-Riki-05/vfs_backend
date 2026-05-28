"use strict";

const { prisma } = require("./prisma");
const logger = require("../utils/logger");

/**
 * Grant 200 Pro AI credits to a user and optionally record a TransactionLog.
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
    const nextReset = new Date();
    nextReset.setMonth(nextReset.getMonth() + 1);
    nextReset.setDate(1);
    nextReset.setHours(0, 0, 0, 0);

    await db.aiCreditBalance.upsert({
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
          },
        });
      }
    }

    logger.info(`[grantProCredits] 200 Pro credits granted to user ${userId}`);
  };

  if (tx) {
    return _run(tx);
  }
  return prisma.$transaction((t) => _run(t));
}

module.exports = { grantProCredits };
