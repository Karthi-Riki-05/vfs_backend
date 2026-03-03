const request = require('supertest');
require('./setup');
const app = require('../index');
const { mockPrisma } = require('./setup');
const { generateTestToken, generateExpiredToken } = require('./helpers');

describe('Flow Endpoints', () => {
    const token = generateTestToken();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/v1/flows', () => {
        it('should return flows for authenticated user', async () => {
            mockPrisma.flow.findMany.mockResolvedValue([
                { id: 'flow-1', name: 'Test Flow', ownerId: 'test-user-id' },
            ]);
            mockPrisma.flow.count.mockResolvedValue(1);

            const res = await request(app)
                .get('/api/v1/flows')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.flows).toHaveLength(1);
        });

        it('should return 401 without token', async () => {
            const res = await request(app).get('/api/v1/flows');
            expect(res.statusCode).toBe(401);
        });

        it('should return 401 with expired token', async () => {
            const expired = generateExpiredToken();
            const res = await request(app)
                .get('/api/v1/flows')
                .set('Authorization', `Bearer ${expired}`);

            expect(res.statusCode).toBe(401);
        });
    });

    describe('POST /api/v1/flows', () => {
        it('should create a flow', async () => {
            mockPrisma.flow.create.mockResolvedValue({
                id: 'new-flow',
                name: 'New Flow',
                ownerId: 'test-user-id',
            });

            const res = await request(app)
                .post('/api/v1/flows')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'New Flow', description: 'Test description' });

            expect(res.statusCode).toBe(201);
            expect(res.body.success).toBe(true);
        });

        it('should return 400 when name is missing', async () => {
            const res = await request(app)
                .post('/api/v1/flows')
                .set('Authorization', `Bearer ${token}`)
                .send({ description: 'No name' });

            expect(res.statusCode).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('GET /api/v1/flows/:id', () => {
        it('should return a flow by id', async () => {
            mockPrisma.flow.findFirst.mockResolvedValue({
                id: 'flow-1', name: 'Test Flow', ownerId: 'test-user-id',
            });

            const res = await request(app)
                .get('/api/v1/flows/flow-1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.id).toBe('flow-1');
        });

        it('should return 404 for nonexistent flow', async () => {
            mockPrisma.flow.findFirst.mockResolvedValue(null);

            const res = await request(app)
                .get('/api/v1/flows/nonexistent')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(404);
        });
    });

    describe('DELETE /api/v1/flows/:id', () => {
        it('should delete a flow', async () => {
            mockPrisma.flow.deleteMany.mockResolvedValue({ count: 1 });

            const res = await request(app)
                .delete('/api/v1/flows/flow-1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });
});
