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
});
