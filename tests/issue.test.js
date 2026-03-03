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
