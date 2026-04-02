const request = require('supertest');
require('./setup');
const app = require('../index');
const { generateTestToken } = require('./helpers');

describe('OpenAI Proxy Endpoint', () => {
    const token = generateTestToken();

    describe('POST /api/v1/openai', () => {
        it('should return 401 without authentication', async () => {
            const res = await request(app)
                .post('/api/v1/openai')
                .send({
                    messages: [{ role: 'user', content: 'Hello' }],
                });

            expect(res.statusCode).toBe(401);
        });

        it('should proxy request with valid auth and body', async () => {
            const res = await request(app)
                .post('/api/v1/openai')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    messages: [{ role: 'user', content: 'Hello' }],
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.content).toBeDefined();
        });

        it('should return 400 for missing messages', async () => {
            const res = await request(app)
                .post('/api/v1/openai')
                .set('Authorization', `Bearer ${token}`)
                .send({});

            expect(res.statusCode).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should return 400 for invalid message role', async () => {
            const res = await request(app)
                .post('/api/v1/openai')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    messages: [{ role: 'invalid', content: 'Hello' }],
                });

            expect(res.statusCode).toBe(400);
        });
    });
});
