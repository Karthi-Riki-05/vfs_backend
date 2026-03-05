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

        it('should support search filter', async () => {
            mockPrisma.flow.findMany.mockResolvedValue([]);
            mockPrisma.flow.count.mockResolvedValue(0);

            const res = await request(app)
                .get('/api/v1/flows?search=test&page=1&limit=5')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.flows).toHaveLength(0);
        });

        it('should support pagination', async () => {
            mockPrisma.flow.findMany.mockResolvedValue([]);
            mockPrisma.flow.count.mockResolvedValue(25);

            const res = await request(app)
                .get('/api/v1/flows?page=2&limit=10')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.totalPages).toBe(3);
            expect(mockPrisma.flow.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ skip: 10, take: 10 })
            );
        });
    });

    describe('POST /api/v1/flows', () => {
        it('should create a flow', async () => {
            mockPrisma.flow.create.mockResolvedValue({
                id: 'new-flow', name: 'New Flow', ownerId: 'test-user-id',
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

        it('should create with diagramData', async () => {
            mockPrisma.flow.create.mockResolvedValue({
                id: 'new-flow', name: 'With Data', diagramData: '<xml>test</xml>',
            });

            const res = await request(app)
                .post('/api/v1/flows')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'With Data', diagramData: '<xml>test</xml>' });

            expect(res.statusCode).toBe(201);
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

    describe('PUT /api/v1/flows/:id', () => {
        it('should update a flow', async () => {
            mockPrisma.flow.findFirst.mockResolvedValue({
                id: 'flow-1', name: 'Old Name', ownerId: 'test-user-id', deletedAt: null,
            });
            mockPrisma.flow.update.mockResolvedValue({
                id: 'flow-1', name: 'New Name',
            });

            const res = await request(app)
                .put('/api/v1/flows/flow-1')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'New Name' });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('should return 404 for non-owned flow', async () => {
            mockPrisma.flow.findFirst.mockResolvedValue(null);

            const res = await request(app)
                .put('/api/v1/flows/flow-1')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Hacked' });

            expect(res.statusCode).toBe(404);
        });
    });

    describe('DELETE /api/v1/flows/:id', () => {
        it('should soft-delete a flow', async () => {
            mockPrisma.flow.findFirst.mockResolvedValue({
                id: 'flow-1', ownerId: 'test-user-id', deletedAt: null,
            });
            mockPrisma.flow.update.mockResolvedValue({
                id: 'flow-1', deletedAt: new Date(),
            });

            const res = await request(app)
                .delete('/api/v1/flows/flow-1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(mockPrisma.flow.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'flow-1' },
                    data: expect.objectContaining({ deletedAt: expect.any(Date) }),
                })
            );
        });

        it('should return 404 for non-owned flow', async () => {
            mockPrisma.flow.findFirst.mockResolvedValue(null);

            const res = await request(app)
                .delete('/api/v1/flows/other-flow')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(404);
        });
    });

    describe('POST /api/v1/flows/:id/duplicate', () => {
        it('should duplicate a flow', async () => {
            mockPrisma.flow.findFirst.mockResolvedValue({
                id: 'flow-1', name: 'Original', description: 'Desc', ownerId: 'test-user-id',
                thumbnail: null, diagramData: '<xml/>', isPublic: false, version: 1,
            });
            mockPrisma.flow.create.mockResolvedValue({
                id: 'flow-2', name: 'Original (Copy)', ownerId: 'test-user-id',
            });

            const res = await request(app)
                .post('/api/v1/flows/flow-1/duplicate')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(201);
            expect(res.body.success).toBe(true);
        });

        it('should return 404 when original not found', async () => {
            mockPrisma.flow.findFirst.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/v1/flows/nonexistent/duplicate')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(404);
        });
    });

    describe('GET /api/v1/flows/trash', () => {
        it('should return trashed flows', async () => {
            mockPrisma.flow.findMany.mockResolvedValue([
                { id: 'flow-1', name: 'Deleted', deletedAt: new Date() },
            ]);
            mockPrisma.flow.count.mockResolvedValue(1);

            const res = await request(app)
                .get('/api/v1/flows/trash')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.flows).toHaveLength(1);
        });
    });

    describe('POST /api/v1/flows/:id/restore', () => {
        it('should restore a trashed flow', async () => {
            mockPrisma.flow.updateMany.mockResolvedValue({ count: 1 });

            const res = await request(app)
                .post('/api/v1/flows/flow-1/restore')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('should return 404 if flow not in trash', async () => {
            mockPrisma.flow.updateMany.mockResolvedValue({ count: 0 });

            const res = await request(app)
                .post('/api/v1/flows/nonexistent/restore')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(404);
        });
    });

    describe('DELETE /api/v1/flows/:id/permanent', () => {
        it('should permanently delete a trashed flow', async () => {
            mockPrisma.flow.deleteMany.mockResolvedValue({ count: 1 });

            const res = await request(app)
                .delete('/api/v1/flows/flow-1/permanent')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('should return 404 if flow not in trash', async () => {
            mockPrisma.flow.deleteMany.mockResolvedValue({ count: 0 });

            const res = await request(app)
                .delete('/api/v1/flows/nonexistent/permanent')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(404);
        });
    });

    describe('PUT /api/v1/flows/:id/diagram', () => {
        it('should update diagram state', async () => {
            mockPrisma.flow.findFirst.mockResolvedValue({
                id: 'flow-1', ownerId: 'test-user-id', diagramData: '{"groups":[]}',
            });
            mockPrisma.flow.update.mockResolvedValue({ id: 'flow-1' });

            const res = await request(app)
                .put('/api/v1/flows/flow-1/diagram')
                .set('Authorization', `Bearer ${token}`)
                .send({ groupId: 'group-1', newShape: { id: 's1', type: 'rect' } });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            // Verify diagramData is serialized as string
            expect(mockPrisma.flow.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: { diagramData: expect.any(String) },
                })
            );
        });

        it('should return 404 for non-owned flow', async () => {
            mockPrisma.flow.findFirst.mockResolvedValue(null);

            const res = await request(app)
                .put('/api/v1/flows/flow-1/diagram')
                .set('Authorization', `Bearer ${token}`)
                .send({ groupId: 'g1', newShape: { id: 's1' } });

            expect(res.statusCode).toBe(404);
        });
    });
});
