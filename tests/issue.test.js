const request = require('supertest');
const { mockPrisma } = require('./setup');
const { generateTestToken } = require('./helpers');
const app = require('../index');

describe('Issue Routes', () => {
    const token = generateTestToken('user-1', 'Viewer');

    beforeEach(() => jest.clearAllMocks());

    describe('GET /api/v1/issues', () => {
        it('should list issues', async () => {
            mockPrisma.issueItem.findMany.mockResolvedValue([
                { id: 'issue-1', title: 'Bug', flowId: 1, isChecked: false },
            ]);
            mockPrisma.issueItem.count.mockResolvedValue(1);

            const res = await request(app)
                .get('/api/v1/issues')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.data.issues).toHaveLength(1);
        });

        it('should return 401 without auth', async () => {
            const res = await request(app).get('/api/v1/issues');
            expect(res.status).toBe(401);
        });

        it('should filter by flowId', async () => {
            mockPrisma.issueItem.findMany.mockResolvedValue([]);
            mockPrisma.issueItem.count.mockResolvedValue(0);

            const res = await request(app)
                .get('/api/v1/issues?flowId=5')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
        });

        it('should support pagination', async () => {
            mockPrisma.issueItem.findMany.mockResolvedValue([]);
            mockPrisma.issueItem.count.mockResolvedValue(30);

            const res = await request(app)
                .get('/api/v1/issues?page=2&limit=10')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.data.totalPages).toBe(3);
        });
    });

    describe('POST /api/v1/issues', () => {
        it('should create an issue', async () => {
            mockPrisma.issueItem.create.mockResolvedValue({
                id: 'issue-new', title: 'New Bug', flowId: 1,
            });

            const res = await request(app)
                .post('/api/v1/issues')
                .set('Authorization', `Bearer ${token}`)
                .send({ title: 'New Bug', flowId: 1 });

            expect(res.status).toBe(201);
        });

        it('should reject missing title', async () => {
            const res = await request(app)
                .post('/api/v1/issues')
                .set('Authorization', `Bearer ${token}`)
                .send({ flowId: 1 });

            expect(res.status).toBe(400);
        });

        it('should reject missing flowId', async () => {
            const res = await request(app)
                .post('/api/v1/issues')
                .set('Authorization', `Bearer ${token}`)
                .send({ title: 'Bug' });

            expect(res.status).toBe(400);
        });

        it('should create with optional fields', async () => {
            mockPrisma.issueItem.create.mockResolvedValue({
                id: 'issue-new', title: 'Bug', flowId: 1, flowItemId: 'node-1', appType: 'enterprise',
            });

            const res = await request(app)
                .post('/api/v1/issues')
                .set('Authorization', `Bearer ${token}`)
                .send({ title: 'Bug', flowId: 1, flowItemId: 'node-1', appType: 'enterprise' });

            expect(res.status).toBe(201);
        });
    });

    describe('GET /api/v1/issues/:id', () => {
        it('should return issue by id', async () => {
            mockPrisma.issueItem.findFirst.mockResolvedValue({
                id: 'issue-1', title: 'Bug', flowId: 1, isChecked: false,
            });

            const res = await request(app)
                .get('/api/v1/issues/issue-1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.data.id).toBe('issue-1');
        });

        it('should return 404 for non-existent issue', async () => {
            mockPrisma.issueItem.findFirst.mockResolvedValue(null);

            const res = await request(app)
                .get('/api/v1/issues/fake-id')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });
    });

    describe('PUT /api/v1/issues/:id', () => {
        it('should update an issue', async () => {
            mockPrisma.issueItem.findFirst.mockResolvedValue({ id: 'issue-1' });
            mockPrisma.issueItem.update.mockResolvedValue({ id: 'issue-1', isChecked: true });

            const res = await request(app)
                .put('/api/v1/issues/issue-1')
                .set('Authorization', `Bearer ${token}`)
                .send({ isChecked: true });

            expect(res.status).toBe(200);
        });

        it('should update title', async () => {
            mockPrisma.issueItem.findFirst.mockResolvedValue({ id: 'issue-1' });
            mockPrisma.issueItem.update.mockResolvedValue({ id: 'issue-1', title: 'Updated Title' });

            const res = await request(app)
                .put('/api/v1/issues/issue-1')
                .set('Authorization', `Bearer ${token}`)
                .send({ title: 'Updated Title' });

            expect(res.status).toBe(200);
        });

        it('should return 404 for non-existent issue', async () => {
            mockPrisma.issueItem.findFirst.mockResolvedValue(null);

            const res = await request(app)
                .put('/api/v1/issues/fake-id')
                .set('Authorization', `Bearer ${token}`)
                .send({ isChecked: true });

            expect(res.status).toBe(404);
        });
    });

    describe('DELETE /api/v1/issues/:id', () => {
        it('should delete an issue', async () => {
            mockPrisma.issueItem.findFirst.mockResolvedValue({ id: 'issue-1' });
            mockPrisma.issueItem.delete.mockResolvedValue({});

            const res = await request(app)
                .delete('/api/v1/issues/issue-1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
        });

        it('should return 404 for non-existent issue', async () => {
            mockPrisma.issueItem.findFirst.mockResolvedValue(null);

            const res = await request(app)
                .delete('/api/v1/issues/fake-id')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });
    });
});
