const request = require('supertest');
require('./setup');
const app = require('../index');
const { mockPrisma, applyDefaultMocks } = require('./setup');
const { generateTestToken } = require('./helpers');

describe('Shape Endpoints', () => {
    const token = generateTestToken();

    beforeEach(() => {
        jest.clearAllMocks();
        applyDefaultMocks();
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

        it('should include public shapes and user-owned shapes', async () => {
            mockPrisma.shape.findMany.mockResolvedValue([]);

            await request(app)
                .get('/api/v1/shapes')
                .set('Authorization', `Bearer ${token}`);

            expect(mockPrisma.shape.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        OR: expect.arrayContaining([
                            { isPublic: true },
                            expect.objectContaining({ ownerId: 'test-user-id' }),
                        ]),
                    }),
                })
            );
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

        it('should create shape with all fields', async () => {
            mockPrisma.shape.create.mockResolvedValue({
                id: 'shape-full', name: 'Full Shape', type: 'html',
            });

            const res = await request(app)
                .post('/api/v1/shapes')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'Full Shape', type: 'html', content: '<div>test</div>',
                    textAlignment: 'center', category: 'flowchart', isPublic: true,
                });

            expect(res.statusCode).toBe(201);
        });
    });

    describe('GET /api/v1/shapes/:id', () => {
        it('should return a shape by id', async () => {
            mockPrisma.shape.findUnique.mockResolvedValue({
                id: 'shape-1', name: 'Test Shape', ownerId: 'test-user-id',
            });

            const res = await request(app)
                .get('/api/v1/shapes/shape-1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.id).toBe('shape-1');
        });

        it('should return 404 for non-existent shape', async () => {
            mockPrisma.shape.findUnique.mockResolvedValue(null);

            const res = await request(app)
                .get('/api/v1/shapes/nonexistent')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(404);
        });
    });

    describe('PUT /api/v1/shapes/:id', () => {
        it('should update an owned shape', async () => {
            mockPrisma.shape.findFirst.mockResolvedValue({
                id: 'shape-1', ownerId: 'test-user-id',
            });
            mockPrisma.shape.update.mockResolvedValue({
                id: 'shape-1', name: 'Updated',
            });

            const res = await request(app)
                .put('/api/v1/shapes/shape-1')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Updated' });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('should return 404 for non-owned shape', async () => {
            mockPrisma.shape.findFirst.mockResolvedValue(null);

            const res = await request(app)
                .put('/api/v1/shapes/shape-1')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Hack' });

            expect(res.statusCode).toBe(404);
        });
    });

    describe('DELETE /api/v1/shapes/:id', () => {
        it('should delete an owned shape', async () => {
            mockPrisma.shape.findFirst.mockResolvedValue({
                id: 'shape-1', ownerId: 'test-user-id',
            });
            mockPrisma.shape.delete.mockResolvedValue({ id: 'shape-1' });

            const res = await request(app)
                .delete('/api/v1/shapes/shape-1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('should return 404 for non-owned shape', async () => {
            mockPrisma.shape.findFirst.mockResolvedValue(null);

            const res = await request(app)
                .delete('/api/v1/shapes/other-shape')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(404);
        });
    });

    describe('GET /api/v1/shapes/categories', () => {
        it('should return distinct categories', async () => {
            mockPrisma.shape.findMany.mockResolvedValue([
                { category: 'flowchart' },
                { category: 'uml' },
            ]);

            const res = await request(app)
                .get('/api/v1/shapes/categories')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data).toEqual(['flowchart', 'uml']);
        });
    });
});
