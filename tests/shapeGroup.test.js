const request = require('supertest');
require('./setup');
const app = require('../index');
const { mockPrisma } = require('./setup');
const { generateTestToken } = require('./helpers');

describe('Shape Group Endpoints', () => {
    const token = generateTestToken();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/v1/shape-groups', () => {
        it('should return shape groups', async () => {
            mockPrisma.shapeGroup.findMany.mockResolvedValue([
                { id: 'group-1', name: 'Group 1', userId: 'test-user-id' },
            ]);

            const res = await request(app)
                .get('/api/v1/shape-groups')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('should return 401 without auth', async () => {
            const res = await request(app).get('/api/v1/shape-groups');
            expect(res.statusCode).toBe(401);
        });
    });

    describe('POST /api/v1/shape-groups', () => {
        it('should create a shape group', async () => {
            mockPrisma.shapeGroup.create.mockResolvedValue({
                id: 'new-group', name: 'New Group', userId: 'test-user-id',
            });

            const res = await request(app)
                .post('/api/v1/shape-groups')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'New Group' });

            expect(res.statusCode).toBe(201);
            expect(res.body.success).toBe(true);
        });

        it('should return 400 for missing name', async () => {
            const res = await request(app)
                .post('/api/v1/shape-groups')
                .set('Authorization', `Bearer ${token}`)
                .send({});

            expect(res.statusCode).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });
    });
});
