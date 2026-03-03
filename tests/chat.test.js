const request = require('supertest');
const { mockPrisma } = require('./setup');
const { generateTestToken } = require('./helpers');
const app = require('../index');

describe('Chat Routes', () => {
    const token = generateTestToken('user-1', 'Viewer');

    beforeEach(() => jest.clearAllMocks());

    describe('GET /api/v1/chat/groups', () => {
        it('should list chat groups', async () => {
            mockPrisma.chatGroup.findMany.mockResolvedValue([
                { id: 'cg-1', title: 'Test Chat', _count: { messages: 5, members: 2 }, messages: [] },
            ]);

            const res = await request(app)
                .get('/api/v1/chat/groups')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(1);
        });

        it('should return 401 without auth', async () => {
            const res = await request(app).get('/api/v1/chat/groups');
            expect(res.status).toBe(401);
        });
    });

    describe('POST /api/v1/chat/groups', () => {
        it('should create a chat group', async () => {
            mockPrisma.chatGroup.create.mockResolvedValue({ id: 'cg-new', title: 'New Chat' });
            mockPrisma.chatGroupUser.create.mockResolvedValue({});
            mockPrisma.chatGroupUser.createMany.mockResolvedValue({});

            const res = await request(app)
                .post('/api/v1/chat/groups')
                .set('Authorization', `Bearer ${token}`)
                .send({ title: 'New Chat' });

            expect(res.status).toBe(201);
        });

        it('should reject empty title', async () => {
            const res = await request(app)
                .post('/api/v1/chat/groups')
                .set('Authorization', `Bearer ${token}`)
                .send({ title: '' });

            expect(res.status).toBe(400);
        });
    });

    describe('POST /api/v1/chat/groups/:id/messages', () => {
        it('should send a message', async () => {
            mockPrisma.chatGroupUser.findFirst.mockResolvedValue({ id: 'cgu-1' });
            mockPrisma.chatMessage.create.mockResolvedValue({
                id: 'msg-1', message: 'Hello', type: 'text',
                user: { id: 'user-1', name: 'Test', email: 'test@test.com' },
            });
            mockPrisma.chatGroup.update.mockResolvedValue({});
            mockPrisma.chatGroupUser.findMany.mockResolvedValue([]);

            const res = await request(app)
                .post('/api/v1/chat/groups/cg-1/messages')
                .set('Authorization', `Bearer ${token}`)
                .send({ message: 'Hello' });

            expect(res.status).toBe(201);
            expect(res.body.data.message).toBe('Hello');
        });
    });

    describe('GET /api/v1/chat/groups/:id/messages', () => {
        it('should return paginated messages', async () => {
            mockPrisma.chatGroupUser.findFirst.mockResolvedValue({ id: 'cgu-1' });
            mockPrisma.chatMessage.findMany.mockResolvedValue([
                { id: 'msg-1', message: 'Hi', user: { id: 'user-1', name: 'Test' } },
            ]);
            mockPrisma.chatMessage.count.mockResolvedValue(1);

            const res = await request(app)
                .get('/api/v1/chat/groups/cg-1/messages')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.data.messages).toHaveLength(1);
        });
    });
});
