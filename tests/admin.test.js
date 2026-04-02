const request = require('supertest');
const { mockPrisma } = require('./setup');
const { generateTestToken } = require('./helpers');
const app = require('../index');

describe('Admin Routes', () => {
    const adminToken = generateTestToken('admin-1', 'Admin');
    const viewerToken = generateTestToken('user-1', 'Viewer');

    beforeEach(() => jest.clearAllMocks());

    describe('GET /api/v1/admin/users', () => {
        it('should list users for admin', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'Admin' });
            mockPrisma.user.findMany.mockResolvedValue([
                { id: 'u-1', name: 'User 1', email: 'u1@test.com', role: 'Viewer' },
            ]);
            mockPrisma.user.count.mockResolvedValue(1);

            const res = await request(app)
                .get('/api/v1/admin/users')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.users).toHaveLength(1);
        });

        it('should reject non-admin users', async () => {
            const res = await request(app)
                .get('/api/v1/admin/users')
                .set('Authorization', `Bearer ${viewerToken}`);

            expect(res.status).toBe(403);
        });

        it('should return 401 without auth', async () => {
            const res = await request(app).get('/api/v1/admin/users');
            expect(res.status).toBe(401);
        });

        it('should support search filter', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'Admin' });
            mockPrisma.user.findMany.mockResolvedValue([]);
            mockPrisma.user.count.mockResolvedValue(0);

            const res = await request(app)
                .get('/api/v1/admin/users?search=test')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
        });
    });

    describe('PUT /api/v1/admin/users/:id', () => {
        it('should update user role', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'Admin' });
            mockPrisma.user.update.mockResolvedValue({ id: 'u-1', role: 'Editor' });

            const res = await request(app)
                .put('/api/v1/admin/users/u-1')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'Editor' });

            expect(res.status).toBe(200);
        });

        it('should reject non-admin', async () => {
            const res = await request(app)
                .put('/api/v1/admin/users/u-1')
                .set('Authorization', `Bearer ${viewerToken}`)
                .send({ role: 'Admin' });

            expect(res.status).toBe(403);
        });
    });

    describe('GET /api/v1/admin/stats', () => {
        it('should return dashboard stats for admin', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'Admin' });
            mockPrisma.user.count.mockResolvedValue(100);
            mockPrisma.subscription.count.mockResolvedValue(50);
            mockPrisma.flow.count.mockResolvedValue(500);
            mockPrisma.team.count.mockResolvedValue(20);
            mockPrisma.transactionLog.aggregate.mockResolvedValue({ _sum: { amountCharged: 50000 } });

            const res = await request(app)
                .get('/api/v1/admin/stats')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.totalUsers).toBe(100);
            expect(res.body.data.activeSubscriptions).toBe(50);
            expect(res.body.data.totalRevenue).toBe(500);
        });

        it('should reject non-admin', async () => {
            const res = await request(app)
                .get('/api/v1/admin/stats')
                .set('Authorization', `Bearer ${viewerToken}`);

            expect(res.status).toBe(403);
        });
    });

    describe('POST /api/v1/admin/plans', () => {
        it('should create a plan', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'Admin' });
            mockPrisma.plan.create.mockResolvedValue({
                id: 'plan-1', name: 'Pro Plan', price: 9.99,
            });

            const res = await request(app)
                .post('/api/v1/admin/plans')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Pro Plan', price: 9.99 });

            expect(res.status).toBe(201);
        });

        it('should reject missing required fields', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'Admin' });

            const res = await request(app)
                .post('/api/v1/admin/plans')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Missing Price' });

            expect(res.status).toBe(400);
        });
    });

    describe('GET /api/v1/admin/plans', () => {
        it('should list all plans', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'Admin' });
            mockPrisma.plan.findMany.mockResolvedValue([
                { id: 'plan-1', name: 'Free', price: 0 },
                { id: 'plan-2', name: 'Pro', price: 9.99 },
            ]);

            const res = await request(app)
                .get('/api/v1/admin/plans')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
        });
    });

    describe('PUT /api/v1/admin/plans/:id', () => {
        it('should update a plan', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'Admin' });
            mockPrisma.plan.findUnique.mockResolvedValue({ id: 'plan-1', name: 'Pro' });
            mockPrisma.plan.update.mockResolvedValue({ id: 'plan-1', price: 14.99 });

            const res = await request(app)
                .put('/api/v1/admin/plans/plan-1')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ price: 14.99 });

            expect(res.status).toBe(200);
        });
    });

    describe('GET /api/v1/admin/subscriptions', () => {
        it('should list subscriptions', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'Admin' });
            mockPrisma.subscription.findMany.mockResolvedValue([]);
            mockPrisma.subscription.count.mockResolvedValue(0);

            const res = await request(app)
                .get('/api/v1/admin/subscriptions')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
        });
    });

    describe('GET /api/v1/admin/transactions', () => {
        it('should list transactions', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'Admin' });
            mockPrisma.transactionLog.findMany.mockResolvedValue([]);
            mockPrisma.transactionLog.count.mockResolvedValue(0);

            const res = await request(app)
                .get('/api/v1/admin/transactions')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
        });
    });

    describe('Offer management', () => {
        it('should list offers', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'Admin' });
            mockPrisma.offer.findMany.mockResolvedValue([]);

            const res = await request(app)
                .get('/api/v1/admin/offers')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
        });

        it('should create an offer', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'Admin' });
            mockPrisma.offer.create.mockResolvedValue({ id: 'offer-1', offName: 'Summer Sale' });

            const res = await request(app)
                .post('/api/v1/admin/offers')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ offName: 'Summer Sale', planOffer: 'plan-1', type: 'discount' });

            expect(res.status).toBe(201);
        });

        it('should delete an offer', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'Admin' });
            mockPrisma.offer.findUnique.mockResolvedValue({ id: 'offer-1' });
            mockPrisma.offer.delete.mockResolvedValue({});

            const res = await request(app)
                .delete('/api/v1/admin/offers/offer-1')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
        });
    });

    describe('GET /api/v1/admin/feedback', () => {
        it('should list feedback', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'Admin' });
            mockPrisma.feedbackQuery.findMany.mockResolvedValue([]);
            mockPrisma.feedbackQuery.count.mockResolvedValue(0);

            const res = await request(app)
                .get('/api/v1/admin/feedback')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
        });
    });
});
