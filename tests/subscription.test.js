const request = require('supertest');
require('./setup');
const app = require('../index');
const { mockPrisma } = require('./setup');
const { generateTestToken } = require('./helpers');

describe('Subscription Endpoints', () => {
    const token = generateTestToken();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/v1/subscription/current', () => {
        it('should return current subscription', async () => {
            mockPrisma.subscription.findUnique.mockResolvedValue({
                id: 'sub-1', userId: 'test-user-id', status: 'active',
                plan: { name: 'Pro', price: 9.99 },
            });

            const res = await request(app)
                .get('/api/v1/subscription/current')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('should return 401 without auth', async () => {
            const res = await request(app).get('/api/v1/subscription/current');
            expect(res.statusCode).toBe(401);
        });

        it('should return null data when no subscription exists', async () => {
            mockPrisma.subscription.findUnique.mockResolvedValue(null);

            const res = await request(app)
                .get('/api/v1/subscription/current')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data).toBeNull();
        });
    });

    describe('GET /api/v1/subscription/plans', () => {
        it('should return available plans without auth', async () => {
            mockPrisma.plan.findMany.mockResolvedValue([
                { id: 'plan-1', name: 'Free', price: 0, tier: 0 },
                { id: 'plan-2', name: 'Pro', price: 9.99, tier: 1 },
            ]);

            const res = await request(app).get('/api/v1/subscription/plans');

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveLength(2);
        });

        it('should return plans ordered by tier', async () => {
            mockPrisma.plan.findMany.mockResolvedValue([]);

            await request(app).get('/api/v1/subscription/plans');

            expect(mockPrisma.plan.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ orderBy: { tier: 'asc' } })
            );
        });
    });

    describe('POST /api/v1/subscription/subscribe', () => {
        it('should subscribe to a plan', async () => {
            mockPrisma.subscription.upsert.mockResolvedValue({
                id: 'sub-1', userId: 'test-user-id', planId: 'plan-2', status: 'active',
            });

            const res = await request(app)
                .post('/api/v1/subscription/subscribe')
                .set('Authorization', `Bearer ${token}`)
                .send({ planId: 'plan-2' });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('should return 400 for missing planId', async () => {
            const res = await request(app)
                .post('/api/v1/subscription/subscribe')
                .set('Authorization', `Bearer ${token}`)
                .send({});

            expect(res.statusCode).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should return 401 without auth', async () => {
            const res = await request(app)
                .post('/api/v1/subscription/subscribe')
                .send({ planId: 'plan-2' });

            expect(res.statusCode).toBe(401);
        });
    });

    describe('POST /api/v1/subscription/cancel', () => {
        it('should cancel subscription', async () => {
            mockPrisma.subscription.update.mockResolvedValue({
                id: 'sub-1', status: 'cancelled',
            });

            const res = await request(app)
                .post('/api/v1/subscription/cancel')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('should return 401 without auth', async () => {
            const res = await request(app).post('/api/v1/subscription/cancel');
            expect(res.statusCode).toBe(401);
        });
    });
});
