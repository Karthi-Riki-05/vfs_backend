const request = require('supertest');
const { mockPrisma } = require('./setup');
const { generateTestToken } = require('./helpers');

const app = require('../index');

describe('Payment Module', () => {
    let token;

    beforeEach(() => {
        token = generateTestToken('user-1');
        jest.clearAllMocks();
    });

    describe('POST /api/v1/payments', () => {
        const stripeInstalled = (() => { try { require.resolve('stripe'); return true; } catch { return false; } })();

        it('should reject without auth', async () => {
            const res = await request(app)
                .post('/api/v1/payments')
                .send({ planId: 'plan-1' });

            expect(res.status).toBe(401);
        });

        it('should reject missing planId', async () => {
            const res = await request(app)
                .post('/api/v1/payments')
                .set('Authorization', `Bearer ${token}`)
                .send({});

            expect(res.status).toBe(400);
        });

        (stripeInstalled ? it : it.skip)('should create checkout session with valid plan', async () => {
            mockPrisma.plan.findUnique.mockResolvedValue({
                id: 'plan-1', name: 'Pro Monthly', price: 9.99, duration: 'monthly', appType: 'individual',
            });
            mockPrisma.user.findUnique.mockResolvedValue({
                id: 'user-1', email: 'test@example.com',
            });

            const res = await request(app)
                .post('/api/v1/payments')
                .set('Authorization', `Bearer ${token}`)
                .send({ planId: 'plan-1' });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('sessionId');
            expect(res.body.data).toHaveProperty('url');
        });

        (stripeInstalled ? it : it.skip)('should return 404 for non-existent plan', async () => {
            mockPrisma.plan.findUnique.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/v1/payments')
                .set('Authorization', `Bearer ${token}`)
                .send({ planId: 'nonexistent' });

            expect(res.status).toBe(404);
        });
    });

    describe('GET /api/v1/payments/transactions', () => {
        it('should return user-specific transactions only', async () => {
            mockPrisma.subscription.findUnique.mockResolvedValue({
                userId: 'user-1', paymentId: 'pi_123',
            });
            mockPrisma.transactionLog.findMany.mockResolvedValue([
                { id: 'tx-1', chargeId: 'pi_123', amountCharged: 999, status: 'success' },
            ]);
            mockPrisma.transactionLog.count.mockResolvedValue(1);

            const res = await request(app)
                .get('/api/v1/payments/transactions')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.transactions).toHaveLength(1);
            // Verify the where clause filters by user's paymentId
            expect(mockPrisma.transactionLog.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        OR: expect.arrayContaining([
                            expect.objectContaining({ chargeId: 'pi_123' }),
                        ]),
                    }),
                })
            );
        });

        it('should return empty transactions for user with no subscription', async () => {
            mockPrisma.subscription.findUnique.mockResolvedValue(null);
            mockPrisma.transactionLog.findMany.mockResolvedValue([]);
            mockPrisma.transactionLog.count.mockResolvedValue(0);

            const res = await request(app)
                .get('/api/v1/payments/transactions')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.data.transactions).toHaveLength(0);
        });

        it('should reject without auth', async () => {
            const res = await request(app).get('/api/v1/payments/transactions');
            expect(res.status).toBe(401);
        });

        it('should support pagination', async () => {
            mockPrisma.subscription.findUnique.mockResolvedValue({
                userId: 'user-1', paymentId: 'pi_123',
            });
            mockPrisma.transactionLog.findMany.mockResolvedValue([]);
            mockPrisma.transactionLog.count.mockResolvedValue(0);

            const res = await request(app)
                .get('/api/v1/payments/transactions?page=2&limit=5')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(mockPrisma.transactionLog.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ skip: 5, take: 5 })
            );
        });
    });

    describe('POST /api/v1/payments/webhook', () => {
        it('should accept valid webhook', async () => {
            const res = await request(app)
                .post('/api/v1/payments/webhook')
                .set('stripe-signature', 'test-sig')
                .send(JSON.stringify({ type: 'checkout.session.completed' }));

            // Webhook endpoint should not require auth
            expect(res.status).not.toBe(401);
        });
    });
});
