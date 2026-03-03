const request = require('supertest');
require('./setup');
const app = require('../index');
const { mockPrisma } = require('./setup');
const { generateTestToken } = require('./helpers');

describe('Shape Endpoints', () => {
    const token = generateTestToken();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/v1/shapes', () => {
        it('should return shapes for authenticated user', async () => {
            mockPrisma.shape.findMany.mockResolvedValue([
                { id: 'shape-1', name: 'Test Shape', ownerId: 'test-user-id' },
            ]);

            const res = await request(app)
                .get('/api/v1/shapes')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('should return 401 without auth', async () => {
            const res = await request(app).get('/api/v1/shapes');
            expect(res.statusCode).toBe(401);
        });
    });

    describe('POST /api/v1/shapes', () => {
        it('should create a shape', async () => {
            mockPrisma.shape.create.mockResolvedValue({
                id: 'new-shape', name: 'New Shape', type: 'stencil',
            });

            const res = await request(app)
                .post('/api/v1/shapes')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'New Shape', type: 'stencil' });

            expect(res.statusCode).toBe(201);
            expect(res.body.success).toBe(true);
        });

        it('should return 400 for invalid type', async () => {
            const res = await request(app)
                .post('/api/v1/shapes')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Bad Shape', type: 'invalid-type' });

            expect(res.statusCode).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should return 400 for missing name', async () => {
            const res = await request(app)
                .post('/api/v1/shapes')
                .set('Authorization', `Bearer ${token}`)
                .send({ type: 'stencil' });

            expect(res.statusCode).toBe(400);
        });
    });

    describe('GET /api/v1/shapes/categories', () => {
        it('should return categories', async () => {
            mockPrisma.shape.findMany.mockResolvedValue([
                { category: 'flowchart' },
                { category: 'uml' },
            ]);

            const res = await request(app)
                .get('/api/v1/shapes/categories')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });
});
