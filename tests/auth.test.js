const request = require('supertest');
require('./setup');
const app = require('../index');
const { mockPrisma } = require('./setup');

describe('Auth Endpoints', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/v1/auth/register', () => {
        it('should register a new user', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);
            mockPrisma.user.create.mockResolvedValue({
                id: 'new-user-id',
                name: 'Test User',
                email: 'test@example.com',
                role: 'Viewer',
            });

            const res = await request(app)
                .post('/api/v1/auth/register')
                .send({ name: 'Test User', email: 'test@example.com', password: 'password123' });

            expect(res.statusCode).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.userId).toBe('new-user-id');
        });

        it('should return 409 if user already exists', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-id', email: 'test@example.com' });

            const res = await request(app)
                .post('/api/v1/auth/register')
                .send({ name: 'Test', email: 'test@example.com', password: 'password123' });

            expect(res.statusCode).toBe(409);
            expect(res.body.success).toBe(false);
        });

        it('should return 400 on validation error (missing email)', async () => {
            const res = await request(app)
                .post('/api/v1/auth/register')
                .send({ name: 'Test', password: 'password123' });

            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should return 400 on validation error (short password)', async () => {
            const res = await request(app)
                .post('/api/v1/auth/register')
                .send({ name: 'Test', email: 'test@example.com', password: '123' });

            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('POST /api/v1/auth/validate', () => {
        it('should return 400 on validation error (missing fields)', async () => {
            const res = await request(app)
                .post('/api/v1/auth/validate')
                .send({});

            expect(res.statusCode).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should return 401 for invalid credentials', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/v1/auth/validate')
                .send({ email: 'nonexistent@example.com', password: 'wrongpassword' });

            expect(res.statusCode).toBe(401);
        });
    });
});
