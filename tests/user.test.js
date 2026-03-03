const request = require('supertest');
const { mockPrisma } = require('./setup');
const { generateTestToken } = require('./helpers');
const app = require('../index');

describe('User Routes', () => {
    const token = generateTestToken('user-1', 'Viewer');

    beforeEach(() => jest.clearAllMocks());

    describe('GET /api/v1/users/me', () => {
        it('should return current user profile', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({
                id: 'user-1', name: 'Test', email: 'test@example.com', role: 'Viewer',
            });

            const res = await request(app)
                .get('/api/v1/users/me')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.id).toBe('user-1');
        });

        it('should return 401 without token', async () => {
            const res = await request(app).get('/api/v1/users/me');
            expect(res.status).toBe(401);
        });
    });

    describe('PUT /api/v1/users/:id', () => {
        it('should update user profile', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null); // no conflict
            mockPrisma.user.update.mockResolvedValue({ id: 'user-1', name: 'Updated' });

            const res = await request(app)
                .put('/api/v1/users/user-1')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Updated' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('should reject invalid email format', async () => {
            const res = await request(app)
                .put('/api/v1/users/user-1')
                .set('Authorization', `Bearer ${token}`)
                .send({ email: 'not-an-email' });

            expect(res.status).toBe(400);
        });
    });

    describe('POST /api/v1/users/forgot-password', () => {
        it('should accept any email without revealing existence', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/v1/users/forgot-password')
                .send({ email: 'unknown@example.com' });

            expect(res.status).toBe(200);
            expect(res.body.data.message).toContain('reset link');
        });
    });

    describe('DELETE /api/v1/users/:id', () => {
        it('should soft delete user', async () => {
            mockPrisma.user.update.mockResolvedValue({ id: 'user-1', userStatus: 'deleted' });

            const res = await request(app)
                .delete('/api/v1/users/user-1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });
});
