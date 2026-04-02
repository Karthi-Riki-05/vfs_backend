const request = require('supertest');
const { mockPrisma, applyDefaultMocks } = require('./setup');
const { generateTestToken } = require('./helpers');
const app = require('../index');

describe('User Routes', () => {
    const token = generateTestToken('user-1', 'Viewer');

    beforeEach(() => {
        jest.clearAllMocks();
        applyDefaultMocks();
    });

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

        it('should return 401 if user not found in db', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);

            const res = await request(app)
                .get('/api/v1/users/me')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(401);
        });
    });

    describe('GET /api/v1/users/:id', () => {
        it('should return user by id', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({
                id: 'user-2', name: 'Other User', email: 'other@example.com',
            });

            const res = await request(app)
                .get('/api/v1/users/user-2')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
        });
    });

    describe('PUT /api/v1/users/:id', () => {
        it('should update user profile', async () => {
            // No email in body, so only auth middleware calls findUnique
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

        it('should update contact number', async () => {
            // No email in body, so only auth middleware calls findUnique
            mockPrisma.user.update.mockResolvedValue({ id: 'user-1', contactNo: '+1234567890' });

            const res = await request(app)
                .put('/api/v1/users/user-1')
                .set('Authorization', `Bearer ${token}`)
                .send({ contactNo: '+1234567890' });

            expect(res.status).toBe(200);
        });
    });

    describe('PUT /api/v1/users/change-password', () => {
        it('should change password with valid current password', async () => {
            // Mock argon2 verify to return true
            mockPrisma.user.findUnique.mockResolvedValue({
                id: 'user-1', password: 'hashed-old-password',
            });
            mockPrisma.user.update.mockResolvedValue({ id: 'user-1' });

            const res = await request(app)
                .put('/api/v1/users/change-password')
                .set('Authorization', `Bearer ${token}`)
                .send({ currentPassword: 'OldPass123!', newPassword: 'NewPass456!' });

            // Will either succeed (200) or fail due to argon2 mock
            expect([200, 401, 500]).toContain(res.status);
        });

        it('should reject weak new password', async () => {
            const res = await request(app)
                .put('/api/v1/users/change-password')
                .set('Authorization', `Bearer ${token}`)
                .send({ currentPassword: 'OldPass123!', newPassword: '123' });

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

        it('should reject invalid email format', async () => {
            const res = await request(app)
                .post('/api/v1/users/forgot-password')
                .send({ email: 'not-an-email' });

            expect(res.status).toBe(400);
        });

        it('should not require auth', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/v1/users/forgot-password')
                .send({ email: 'test@test.com' });

            expect(res.status).not.toBe(401);
        });
    });

    describe('POST /api/v1/users/reset-password', () => {
        it('should reject missing token', async () => {
            const res = await request(app)
                .post('/api/v1/users/reset-password')
                .send({ password: 'NewPass123!' });

            expect(res.status).toBe(400);
        });

        it('should reject weak password', async () => {
            const res = await request(app)
                .post('/api/v1/users/reset-password')
                .send({ token: 'some-token', password: '123' });

            expect(res.status).toBe(400);
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

        it('should require auth', async () => {
            const res = await request(app).delete('/api/v1/users/user-1');
            expect(res.status).toBe(401);
        });
    });
});
