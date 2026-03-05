const { prisma } = require('../lib/prisma');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

class PaymentService {
    getStripe() {
        if (!process.env.STRIPE_SECRET_KEY) {
            throw new AppError('Stripe is not configured', 503, 'STRIPE_NOT_CONFIGURED');
        }
        return require('stripe')(process.env.STRIPE_SECRET_KEY);
    }

    async createCheckoutSession(userId, planId, urls = {}) {
        const stripe = this.getStripe();
        const plan = await prisma.plan.findUnique({ where: { id: planId } });
        if (!plan) throw new AppError('Plan not found', 404, 'NOT_FOUND');

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

        const baseUrl = process.env.APP_URL || 'http://localhost:3000';
        const session = await stripe.checkout.sessions.create({
            mode: plan.price === 0 ? 'setup' : (plan.duration === 'monthly' || plan.duration === 'yearly' ? 'subscription' : 'payment'),
            customer_email: user.email,
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: plan.name, description: `ValueChart ${plan.appType || ''} Plan` },
                    unit_amount: Math.round(plan.price * 100),
                    ...(plan.duration && { recurring: { interval: plan.duration === 'yearly' ? 'year' : 'month' } }),
                },
                quantity: 1,
            }],
            metadata: { userId, planId, appType: plan.appType || '' },
            success_url: urls.successUrl || `${baseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: urls.cancelUrl || `${baseUrl}/subscription`,
        });

        return { sessionId: session.id, url: session.url };
    }

    async handleWebhook(rawBody, signature) {
        const stripe = this.getStripe();
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) throw new AppError('Webhook secret not configured', 503, 'CONFIG_ERROR');

        let event;
        try {
            event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
        } catch (err) {
            logger.error('Stripe webhook signature verification failed', { error: err.message });
            throw new AppError('Invalid webhook signature', 400, 'INVALID_SIGNATURE');
        }

        logger.info(`Stripe webhook received: ${event.type}`, { eventId: event.id });

        switch (event.type) {
            case 'checkout.session.completed':
                await this._handleCheckoutComplete(event.data.object);
                break;
            case 'invoice.paid':
                await this._handleInvoicePaid(event.data.object);
                break;
            case 'invoice.payment_failed':
                await this._handlePaymentFailed(event.data.object);
                break;
            case 'customer.subscription.updated':
                await this._handleSubscriptionUpdated(event.data.object);
                break;
            case 'customer.subscription.deleted':
                await this._handleSubscriptionDeleted(event.data.object);
                break;
            default:
                logger.info(`Unhandled webhook event: ${event.type}`);
        }

        return { received: true };
    }

    async _handleCheckoutComplete(session) {
        const { userId, planId, appType } = session.metadata;
        if (!userId || !planId) return;

        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);

        await prisma.$transaction([
            prisma.subscription.upsert({
                where: { userId },
                update: { planId, status: 'active', paymentId: session.payment_intent || session.subscription, startedAt: new Date(), expiresAt, appType: appType || null },
                create: { userId, planId, status: 'active', paymentId: session.payment_intent || session.subscription, price: (session.amount_total || 0) / 100, startedAt: new Date(), expiresAt, appType: appType || null },
            }),
            prisma.transactionLog.create({
                data: {
                    chargeId: session.payment_intent || session.id,
                    txnId: session.id,
                    amountCharged: session.amount_total || 0,
                    currency: session.currency || 'usd',
                    status: 'success',
                    paymentMethod: session.payment_method_types?.[0] || 'card',
                },
            }),
        ]);

        logger.info(`Subscription activated for user ${userId}, plan ${planId}`);
    }

    async _handleInvoicePaid(invoice) {
        if (invoice.subscription) {
            const sub = await prisma.subscription.findFirst({
                where: { paymentId: invoice.subscription },
            });
            if (sub) {
                const expiresAt = new Date();
                expiresAt.setMonth(expiresAt.getMonth() + 1);
                await prisma.subscription.update({
                    where: { id: sub.id },
                    data: { status: 'active', expiresAt },
                });
            }
        }
    }

    async _handlePaymentFailed(invoice) {
        if (invoice.subscription) {
            const sub = await prisma.subscription.findFirst({
                where: { paymentId: invoice.subscription },
            });
            if (sub) {
                await prisma.subscription.update({
                    where: { id: sub.id },
                    data: { status: 'past_due' },
                });
            }
        }
        logger.warn(`Payment failed for invoice ${invoice.id}`);
    }

    async _handleSubscriptionUpdated(subscription) {
        const sub = await prisma.subscription.findFirst({
            where: { paymentId: subscription.id },
        });
        if (sub) {
            await prisma.subscription.update({
                where: { id: sub.id },
                data: { status: subscription.status === 'active' ? 'active' : subscription.status },
            });
        }
    }

    async _handleSubscriptionDeleted(subscription) {
        const sub = await prisma.subscription.findFirst({
            where: { paymentId: subscription.id },
        });
        if (sub) {
            await prisma.subscription.update({
                where: { id: sub.id },
                data: { status: 'cancelled' },
            });
        }
    }

    async getTransactions(userId, options = {}) {
        const { page = 1, limit = 20 } = options;
        const take = Math.min(Number(limit) || 20, 100);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

        // Get the user's subscription to find their payment IDs
        const subscription = await prisma.subscription.findUnique({ where: { userId } });
        const where = subscription?.paymentId
            ? { OR: [{ chargeId: subscription.paymentId }, { txnId: subscription.paymentId }] }
            : { chargeId: '__none__' }; // No subscription = no transactions

        const [transactions, total] = await Promise.all([
            prisma.transactionLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
            prisma.transactionLog.count({ where }),
        ]);

        return { transactions, total, page: Number(page) || 1, totalPages: Math.ceil(total / take) };
    }
}

module.exports = new PaymentService();
