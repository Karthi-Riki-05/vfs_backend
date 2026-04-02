const request = require('supertest');
require('./setup');
const app = require('../index');
const { generateTestToken } = require('./helpers');

describe('AI Generate Diagram Endpoint', () => {
    const token = generateTestToken();

    describe('POST /api/v1/ai/generate-diagram', () => {
        it('should return 401 without authentication', async () => {
            const res = await request(app)
                .post('/api/v1/ai/generate-diagram')
                .send({ prompt: 'User login flow' });

            expect(res.statusCode).toBe(401);
        });

        it('should generate a diagram with valid auth', async () => {
            const res = await request(app)
                .post('/api/v1/ai/generate-diagram')
                .set('Authorization', `Bearer ${token}`)
                .send({ prompt: 'User login flow with email verification' });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.structuredData).toBeDefined();
        });

        it('should return 400 for missing prompt', async () => {
            const res = await request(app)
                .post('/api/v1/ai/generate-diagram')
                .set('Authorization', `Bearer ${token}`)
                .send({});

            expect(res.statusCode).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });
    });
});
