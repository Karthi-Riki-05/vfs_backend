const request = require('supertest');
require('./setup');
const app = require('../index');

describe('Security Headers & General', () => {
    it('should not expose x-powered-by header', async () => {
        const res = await request(app).get('/');
        expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('should return security headers (helmet)', async () => {
        const res = await request(app).get('/health');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBeDefined();
    });

    it('should return 404 for unknown routes', async () => {
        const res = await request(app).get('/api/v1/nonexistent');
        expect(res.statusCode).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should have health check endpoint', async () => {
        const res = await request(app).get('/health');
        expect(res.statusCode).toBe(200);
        expect(res.body.data.status).toBe('ok');
    });

    it('should reject requests with invalid JSON', async () => {
        const res = await request(app)
            .post('/api/v1/auth/register')
            .set('Content-Type', 'application/json')
            .send('invalid json{');

        expect(res.statusCode).toBe(400);
    });

    it('should return consistent error format', async () => {
        const res = await request(app).get('/api/v1/nonexistent');
        expect(res.body).toHaveProperty('success', false);
        expect(res.body).toHaveProperty('error');
        expect(res.body.error).toHaveProperty('code');
        expect(res.body.error).toHaveProperty('message');
    });
});
