const { prisma } = require('../lib/prisma');
const { getStripe, getStripeCurrency } = require('../lib/stripe');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const FLOW_PRICING = {
    '50': 500,        // $5.00
    'unlimited': 1000, // $10.00
};

class ProService {
    async getAppStatus(userId) {
        console.log('[ProService.getAppStatus] userId:', userId);
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
            },
        });
        if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

        console.log('[ProService.getAppStatus] user.hasPro:', user.hasPro, 'currentVersion:', user.currentVersion);

        let proFlowsUsed = 0;
        if (user.hasPro) {
            proFlowsUsed = await prisma.flow.count({
                where: { ownerId: userId, deletedAt: null, appContext: 'pro' },
            });
        }

        const maxFlows = user.proFlowLimit + user.proAdditionalFlowsPurchased;

        return {
            currentApp: user.currentVersion || 'free',
            hasPro: user.hasPro,
            proPurchasedAt: user.proPurchasedAt,
            isUnlimited: user.proUnlimitedFlows,
            proFlows: {
                used: proFlowsUsed,
                max: user.proUnlimitedFlows ? -1 : maxFlows,
                baseLimit: user.proFlowLimit,
                extraPurchased: user.proAdditionalFlowsPurchased,
            },
        };
    }

    async verifyPurchase(userId, sessionId) {
        console.log('[ProService.verifyPurchase] userId:', userId, 'sessionId:', sessionId);

        if (!sessionId) {
            throw new AppError('Missing session_id', 400, 'VALIDATION_ERROR');
        }

        const stripe = getStripe();

        // Retrieve the checkout session from Stripe
        let session;
        try {
            session = await stripe.checkout.sessions.retrieve(sessionId);
            console.log('[ProService.verifyPurchase] Stripe session status:', session.payment_status, 'metadata:', JSON.stringify(session.metadata));
        } catch (err) {
            console.error('[ProService.verifyPurchase] Stripe retrieve failed:', err.message);
            throw new AppError('Failed to verify payment with Stripe', 500, 'STRIPE_ERROR');
        }

        // Verify payment was successful
        if (session.payment_status !== 'paid') {
            console.log('[ProService.verifyPurchase] Payment not completed, status:', session.payment_status);
            return { verified: false, message: 'Payment not completed yet' };
        }

        // Verify this session belongs to this user
        if (session.metadata?.userId !== String(userId)) {
            console.error('[ProService.verifyPurchase] userId mismatch. Session:', session.metadata?.userId, 'Request:', userId);
            throw new AppError('Session does not belong to this user', 403, 'FORBIDDEN');
        }

        // Verify it's a Pro purchase
        if (session.metadata?.purchaseType !== 'pro_upgrade') {
            throw new AppError('Not a Pro purchase session', 400, 'INVALID_SESSION');
        }

        // Check if already activated
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { hasPro: true },
        });

        if (user?.hasPro) {
            console.log('[ProService.verifyPurchase] Already active for user:', userId);
            return { verified: true, alreadyActive: true };
        }

        // ACTIVATE PRO — backup in case webhook was slow/failed
        console.log('[ProService.verifyPurchase] Activating Pro for user:', userId);
        await prisma.user.update({
            where: { id: userId },
            data: {
                hasPro: true,
                proPurchasedAt: new Date(),
                currentVersion: 'pro',
            },
        });

        // Log transaction (only if not already logged by webhook)
        const existingTxn = await prisma.transactionLog.findFirst({
            where: { txnId: sessionId },
        });
        if (!existingTxn) {
            await prisma.transactionLog.create({
                data: {
                    chargeId: session.payment_intent || session.id,
                    txnId: session.id,
                    amountCharged: session.amount_total || 100,
                    currency: session.currency || getStripeCurrency(),
                    status: 'success',
                    paymentMethod: session.payment_method_types?.[0] || 'card',
                },
            });
        }

        logger.info(`Pro activated via verify-purchase for user: ${userId}`);
        return { verified: true, activated: true };
    }

    async switchApp(userId, app) {
        if (app !== 'free' && app !== 'pro') {
            throw new AppError('Invalid app type. Use "free" or "pro"', 400, 'VALIDATION_ERROR');
        }

        if (app === 'pro') {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { hasPro: true },
            });
            if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
            if (!user.hasPro) {
                throw new AppError('No Pro access. Purchase Pro to access this app.', 403, 'PRO_REQUIRED');
            }
        }

        await prisma.user.update({
            where: { id: userId },
            data: { currentVersion: app },
        });

        return { currentApp: app };
    }

    async createProPurchaseCheckout(userId) {
        const stripe = getStripe();
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { hasPro: true, email: true, stripeCustomerId: true },
        });
        if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
        if (user.hasPro) {
            throw new AppError('You already have Pro access', 400, 'ALREADY_PRO');
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

        const baseUrl = process.env.APP_URL || 'http://localhost:3000';
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer: customerId,
            line_items: [{
                price_data: {
                    currency: getStripeCurrency(),
                    product_data: {
                        name: 'ValueChart Pro',
                        description: 'One-time purchase — Pro access forever',
                    },
                    unit_amount: 100, // $1.00
                },
                quantity: 1,
            }],
            metadata: {
                userId,
                purchaseType: 'pro_upgrade',
            },
            success_url: `${baseUrl}/upgrade-pro/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/upgrade-pro`,
        });

        return { sessionId: session.id, url: session.url };
    }

    async createFlowPurchaseCheckout(userId, flowPackage) {
        const stripe = getStripe();
        const amount = FLOW_PRICING[flowPackage];
        if (!amount) {
            throw new AppError('Invalid package. Choose "50" or "unlimited"', 400, 'VALIDATION_ERROR');
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { hasPro: true, currentVersion: true, proUnlimitedFlows: true, stripeCustomerId: true, email: true },
        });
        if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
        if (!user.hasPro) {
            throw new AppError('Pro access required', 403, 'PRO_REQUIRED');
        }
        if (user.proUnlimitedFlows) {
            throw new AppError('You already have unlimited flows', 400, 'ALREADY_UNLIMITED');
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

        const isUnlimited = flowPackage === 'unlimited';
        const flowCount = isUnlimited ? -1 : 50;
        const productName = isUnlimited ? 'Unlimited Flows' : '50 Flows Pack';
        const description = isUnlimited
            ? 'Unlimited Flows for ValueChart Pro'
            : '50 Additional Flows for ValueChart Pro';

        const baseUrl = process.env.APP_URL || 'http://localhost:3000';
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer: customerId,
            line_items: [{
                price_data: {
                    currency: getStripeCurrency(),
                    product_data: {
                        name: productName,
                        description,
                    },
                    unit_amount: amount,
                },
                quantity: 1,
            }],
            metadata: {
                userId,
                purchaseType: 'pro_extra_flows',
                flowPackage,
                flowCount: String(flowCount),
            },
            success_url: `${baseUrl}/dashboard/subscription?purchased=${flowPackage}`,
            cancel_url: `${baseUrl}/dashboard/subscription`,
        });

        return { sessionId: session.id, url: session.url };
    }

    async handleProUpgradeWebhook(session) {
        const userId = session.metadata.userId;
        console.log('=== WEBHOOK: pro_upgrade ===');
        console.log('userId:', userId);
        console.log('Payment Intent:', session.payment_intent);
        if (!userId) {
            console.error('[handleProUpgradeWebhook] No userId in metadata!');
            return;
        }

        try {
            await prisma.user.update({
                where: { id: userId },
                data: {
                    hasPro: true,
                    proPurchasedAt: new Date(),
                    currentVersion: 'pro',
                },
            });
            console.log('[handleProUpgradeWebhook] Database updated: hasPro=true for user:', userId);
        } catch (err) {
            console.error('[handleProUpgradeWebhook] FAILED to update user:', err.message);
            throw err;
        }

        // Log transaction (skip if already logged by verify-purchase)
        const existingTxn = await prisma.transactionLog.findFirst({
            where: { txnId: session.id },
        });
        if (!existingTxn) {
            await prisma.transactionLog.create({
                data: {
                    chargeId: session.payment_intent || session.id,
                    txnId: session.id,
                    amountCharged: session.amount_total || 100,
                    currency: session.currency || getStripeCurrency(),
                    status: 'success',
                    paymentMethod: session.payment_method_types?.[0] || 'card',
                },
            });
        }

        logger.info(`Pro purchased for user: ${userId}`);
    }

    async handleExtraFlowsWebhook(session) {
        const userId = session.metadata.userId;
        const flowPackage = session.metadata.flowPackage;
        const flowCount = parseInt(session.metadata.flowCount);
        if (!userId) return;

        const isUnlimited = flowPackage === 'unlimited';

        const operations = [];

        if (isUnlimited) {
            operations.push(
                prisma.user.update({
                    where: { id: userId },
                    data: { proUnlimitedFlows: true },
                })
            );
            logger.info(`Unlimited flows activated for user: ${userId}`);
        } else {
            operations.push(
                prisma.user.update({
                    where: { id: userId },
                    data: {
                        proAdditionalFlowsPurchased: { increment: flowCount },
                    },
                })
            );
            logger.info(`Added ${flowCount} extra flows for user: ${userId}`);
        }

        operations.push(
            prisma.proFlowPurchase.create({
                data: {
                    userId,
                    flowCount: isUnlimited ? -1 : flowCount,
                    amountCents: session.amount_total || 0,
                    stripePaymentIntentId: session.payment_intent || session.id,
                },
            }),
            prisma.transactionLog.create({
                data: {
                    chargeId: session.payment_intent || session.id,
                    txnId: session.id,
                    amountCharged: session.amount_total || 0,
                    currency: session.currency || getStripeCurrency(),
                    status: 'success',
                    paymentMethod: session.payment_method_types?.[0] || 'card',
                },
            })
        );

        await prisma.$transaction(operations);
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
            },
        });

        if (!user || !user.hasPro || user.currentVersion !== 'pro') {
            return { isPro: false };
        }

        // Unlimited — no limit
        if (user.proUnlimitedFlows) {
            return { isPro: true, allowed: true, used: 0, max: -1, isUnlimited: true };
        }

        const flowCount = await prisma.flow.count({
            where: { ownerId: userId, deletedAt: null, appContext: 'pro' },
        });
        const maxFlows = user.proFlowLimit + user.proAdditionalFlowsPurchased;

        if (flowCount >= maxFlows) {
            throw new AppError(
                `Pro flow limit reached. You have used ${flowCount} of ${maxFlows} flows. Purchase additional flows to create more.`,
                403,
                'PRO_FLOW_LIMIT_REACHED'
            );
        }

        return { isPro: true, allowed: true, used: flowCount, max: maxFlows };
    }

    getFlowPricing() {
        return [
            { package: '50', flowCount: 50, amountCents: 500, amountDisplay: '$5.00', description: 'Added to your current balance' },
            { package: 'unlimited', flowCount: -1, amountCents: 1000, amountDisplay: '$10.00', description: 'Never worry about flow limits again' },
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
            },
        });
        if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
        if (!user.hasPro) {
            throw new AppError('Pro access required', 403, 'PRO_REQUIRED');
        }

        const flowCount = await prisma.flow.count({
            where: { ownerId: userId, deletedAt: null, appContext: 'pro' },
        });

        const totalFlows = user.proUnlimitedFlows ? -1 : (user.proFlowLimit + user.proAdditionalFlowsPurchased);
        const remaining = user.proUnlimitedFlows ? -1 : (totalFlows - flowCount);

        const purchases = await prisma.proFlowPurchase.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });

        return {
            plan: 'Pro',
            originalPrice: '$1',
            isUnlimited: user.proUnlimitedFlows,
            flows: {
                free: user.proFlowLimit,
                purchased: user.proAdditionalFlowsPurchased,
                total: totalFlows,
                used: flowCount,
                remaining,
            },
            purchases: purchases.map(p => ({
                id: p.id,
                flowCount: p.flowCount,
                amountCents: p.amountCents,
                createdAt: p.createdAt,
            })),
        };
    }
}

module.exports = new ProService();
