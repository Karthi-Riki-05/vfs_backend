const request = require('supertest');
const { mockPrisma, applyDefaultMocks } = require('./setup');
const { generateTestToken } = require('./helpers');
const app = require('../index');

describe('Chat Routes', () => {
    const token = generateTestToken('user-1', 'Viewer');

    beforeEach(() => {
        jest.clearAllMocks();
        applyDefaultMocks();
    });

    describe('GET /api/v1/chat/groups', () => {
        it('should list chat groups', async () => {
            mockPrisma.chatGroup.findMany.mockResolvedValue([
                { id: 'cg-1', title: 'Test Chat', _count: { messages: 5, members: 2 }, messages: [], members: [{ lastReadAt: null }] },
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

        it('should return empty array when no groups', async () => {
            mockPrisma.chatGroup.findMany.mockResolvedValue([]);

            const res = await request(app)
                .get('/api/v1/chat/groups')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(0);
        });
    });

    describe('POST /api/v1/chat/groups', () => {
        it('should create a chat group', async () => {
            // checkTeamAccess requires hasPro+pro or active subscription
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'Viewer', userStatus: 'active', currentVersion: 'pro', hasPro: true });
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
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'Viewer', userStatus: 'active', currentVersion: 'pro', hasPro: true });
            const res = await request(app)
                .post('/api/v1/chat/groups')
                .set('Authorization', `Bearer ${token}`)
                .send({ title: '' });

            expect(res.status).toBe(400);
        });

        it('should create group with initial members', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'Viewer', userStatus: 'active', currentVersion: 'pro', hasPro: true });
            mockPrisma.chatGroup.create.mockResolvedValue({ id: 'cg-new', title: 'Team Chat' });
            mockPrisma.chatGroupUser.create.mockResolvedValue({});
            mockPrisma.chatGroupUser.createMany.mockResolvedValue({ count: 2 });

            const res = await request(app)
                .post('/api/v1/chat/groups')
                .set('Authorization', `Bearer ${token}`)
                .send({ title: 'Team Chat', memberIds: ['user-2', 'user-3'] });

            expect(res.status).toBe(201);
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

        it('should reject empty message', async () => {
            const res = await request(app)
                .post('/api/v1/chat/groups/cg-1/messages')
                .set('Authorization', `Bearer ${token}`)
                .send({ message: '' });

            expect(res.status).toBe(400);
        });

        it('should return 403 for non-member', async () => {
            mockPrisma.chatGroupUser.findFirst.mockResolvedValue(null);
            mockPrisma.chatGroup.findFirst.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/v1/chat/groups/cg-1/messages')
                .set('Authorization', `Bearer ${token}`)
                .send({ message: 'Not allowed' });

            expect(res.status).toBe(403);
        });

        it('should create read receipts for other members', async () => {
            mockPrisma.chatGroupUser.findFirst.mockResolvedValue({ id: 'cgu-1' });
            mockPrisma.chatMessage.create.mockResolvedValue({
                id: 'msg-1', message: 'Hi all', type: 'text',
                user: { id: 'user-1', name: 'Test', email: 'test@test.com' },
            });
            mockPrisma.chatGroup.update.mockResolvedValue({});
            mockPrisma.chatGroupUser.findMany.mockResolvedValue([
                { userId: 'user-2' }, { userId: 'user-3' },
            ]);
            mockPrisma.chatMessageUser.createMany.mockResolvedValue({ count: 2 });

            const res = await request(app)
                .post('/api/v1/chat/groups/cg-1/messages')
                .set('Authorization', `Bearer ${token}`)
                .send({ message: 'Hi all' });

            expect(res.status).toBe(201);
            expect(mockPrisma.chatMessageUser.createMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.arrayContaining([
                        expect.objectContaining({ receiverId: 'user-2', isRead: false }),
                        expect.objectContaining({ receiverId: 'user-3', isRead: false }),
                    ]),
                })
            );
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

        it('should return 403 for non-member', async () => {
            mockPrisma.chatGroupUser.findFirst.mockResolvedValue(null);
            mockPrisma.chatGroup.findFirst.mockResolvedValue(null);

            const res = await request(app)
                .get('/api/v1/chat/groups/cg-1/messages')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(403);
        });
    });

    describe('POST /api/v1/chat/groups/:id/members', () => {
        it('should add a member to chat group', async () => {
            mockPrisma.chatGroup.findFirst.mockResolvedValue({ id: 'cg-1', userId: 'user-1' });
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
            mockPrisma.chatGroupUser.findFirst.mockResolvedValue(null);
            mockPrisma.chatGroupUser.create.mockResolvedValue({
                id: 'cgu-new', userId: 'user-2',
                user: { id: 'user-2', name: 'New Member', email: 'new@test.com' },
            });

            const res = await request(app)
                .post('/api/v1/chat/groups/cg-1/members')
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: 'user-2' });

            expect(res.status).toBe(201);
        });

        it('should reject adding existing member', async () => {
            mockPrisma.chatGroup.findFirst.mockResolvedValue({ id: 'cg-1', userId: 'user-1' });
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
            mockPrisma.chatGroupUser.findFirst.mockResolvedValue({ id: 'existing' });

            const res = await request(app)
                .post('/api/v1/chat/groups/cg-1/members')
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: 'user-2' });

            expect(res.status).toBe(409);
        });
    });

    describe('PUT /api/v1/chat/messages/:id/read', () => {
        it('should mark message as read', async () => {
            mockPrisma.chatMessageUser.updateMany.mockResolvedValue({ count: 1 });

            const res = await request(app)
                .put('/api/v1/chat/messages/msg-1/read')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });
});
