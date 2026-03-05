const request = require('supertest');
const { mockPrisma } = require('./setup');
const { generateTestToken } = require('./helpers');
const app = require('../index');

describe('Team Routes', () => {
    const token = generateTestToken('owner-1', 'Viewer');

    beforeEach(() => jest.clearAllMocks());

    describe('GET /api/v1/teams', () => {
        it('should list user teams', async () => {
            mockPrisma.team.findMany.mockResolvedValue([
                { id: 'team-1', teamOwnerId: 'owner-1', owner: { id: 'owner-1', name: 'Owner' }, _count: { members: 3 } },
            ]);
            mockPrisma.team.count.mockResolvedValue(1);

            const res = await request(app)
                .get('/api/v1/teams')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.data.teams).toHaveLength(1);
        });

        it('should return 401 without auth', async () => {
            const res = await request(app).get('/api/v1/teams');
            expect(res.status).toBe(401);
        });

        it('should support pagination', async () => {
            mockPrisma.team.findMany.mockResolvedValue([]);
            mockPrisma.team.count.mockResolvedValue(50);

            const res = await request(app)
                .get('/api/v1/teams?page=2&limit=10')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.data.totalPages).toBe(5);
        });
    });

    describe('POST /api/v1/teams', () => {
        it('should create a team', async () => {
            mockPrisma.team.create.mockResolvedValue({
                id: 'team-new', teamOwnerId: 'owner-1', status: 'active',
                owner: { id: 'owner-1', name: 'Owner', email: 'test@test.com' },
            });
            mockPrisma.teamMember.create.mockResolvedValue({});

            const res = await request(app)
                .post('/api/v1/teams')
                .set('Authorization', `Bearer ${token}`)
                .send({ appType: 'enterprise' });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
        });
    });

    describe('GET /api/v1/teams/:id', () => {
        it('should get team with members', async () => {
            mockPrisma.team.findFirst.mockResolvedValue({
                id: 'team-1', teamOwnerId: 'owner-1',
                owner: { id: 'owner-1', name: 'Owner', email: 'test@test.com' },
                members: [],
            });

            const res = await request(app)
                .get('/api/v1/teams/team-1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.data.id).toBe('team-1');
        });

        it('should return 404 for non-existent team', async () => {
            mockPrisma.team.findFirst.mockResolvedValue(null);

            const res = await request(app)
                .get('/api/v1/teams/nonexistent')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });
    });

    describe('PUT /api/v1/teams/:id', () => {
        it('should update team settings', async () => {
            mockPrisma.team.findFirst.mockResolvedValue({ id: 'team-1', teamOwnerId: 'owner-1' });
            mockPrisma.team.update.mockResolvedValue({ id: 'team-1', teamMem: 20 });

            const res = await request(app)
                .put('/api/v1/teams/team-1')
                .set('Authorization', `Bearer ${token}`)
                .send({ teamMem: 20 });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('should return 404 for non-owned team', async () => {
            mockPrisma.team.findFirst.mockResolvedValue(null);

            const res = await request(app)
                .put('/api/v1/teams/team-1')
                .set('Authorization', `Bearer ${token}`)
                .send({ teamMem: 20 });

            expect(res.status).toBe(404);
        });
    });

    describe('DELETE /api/v1/teams/:id', () => {
        it('should delete owned team', async () => {
            mockPrisma.team.findUnique.mockResolvedValue({ id: 'team-1', teamOwnerId: 'owner-1' });
            mockPrisma.teamMember.deleteMany.mockResolvedValue({ count: 3 });
            mockPrisma.team.delete.mockResolvedValue({});

            const res = await request(app)
                .delete('/api/v1/teams/team-1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('should return 404 for non-existent team', async () => {
            mockPrisma.team.findUnique.mockResolvedValue(null);

            const res = await request(app)
                .delete('/api/v1/teams/nonexistent')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });

        it('should forbid non-owner from deleting', async () => {
            mockPrisma.team.findUnique.mockResolvedValue({ id: 'team-1', teamOwnerId: 'other-user' });

            const res = await request(app)
                .delete('/api/v1/teams/team-1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(403);
        });
    });

    describe('POST /api/v1/teams/:id/members', () => {
        it('should add a member', async () => {
            mockPrisma.team.findFirst.mockResolvedValue({ id: 'team-1', teamOwnerId: 'owner-1', teamMem: 10 });
            mockPrisma.teamMember.count.mockResolvedValue(2);
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-2', email: 'member@test.com' });
            mockPrisma.teamMember.findFirst.mockResolvedValue(null);
            mockPrisma.teamMember.create.mockResolvedValue({
                id: 'tm-1', userId: 'user-2', teamId: 'team-1',
                user: { id: 'user-2', name: 'Member', email: 'member@test.com' },
            });
            mockPrisma.team.update.mockResolvedValue({});

            const res = await request(app)
                .post('/api/v1/teams/team-1/members')
                .set('Authorization', `Bearer ${token}`)
                .send({ email: 'member@test.com' });

            expect(res.status).toBe(201);
        });

        it('should reject invalid email', async () => {
            const res = await request(app)
                .post('/api/v1/teams/team-1/members')
                .set('Authorization', `Bearer ${token}`)
                .send({ email: 'not-email' });

            expect(res.status).toBe(400);
        });

        it('should reject duplicate member', async () => {
            mockPrisma.team.findFirst.mockResolvedValue({ id: 'team-1', teamOwnerId: 'owner-1', teamMem: 10 });
            mockPrisma.teamMember.count.mockResolvedValue(2);
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-2', email: 'member@test.com' });
            mockPrisma.teamMember.findFirst.mockResolvedValue({ id: 'tm-existing' });

            const res = await request(app)
                .post('/api/v1/teams/team-1/members')
                .set('Authorization', `Bearer ${token}`)
                .send({ email: 'member@test.com' });

            expect(res.status).toBe(409);
        });

        it('should reject when member limit reached', async () => {
            mockPrisma.team.findFirst.mockResolvedValue({ id: 'team-1', teamOwnerId: 'owner-1', teamMem: 3 });
            mockPrisma.teamMember.count.mockResolvedValue(3);

            const res = await request(app)
                .post('/api/v1/teams/team-1/members')
                .set('Authorization', `Bearer ${token}`)
                .send({ email: 'new@test.com' });

            expect(res.status).toBe(400);
        });
    });

    describe('DELETE /api/v1/teams/:id/members/:uid', () => {
        it('should remove a member', async () => {
            mockPrisma.team.findFirst.mockResolvedValue({ id: 'team-1', teamOwnerId: 'owner-1' });
            mockPrisma.teamMember.findFirst.mockResolvedValue({ id: 'tm-1', userId: 'user-2' });
            mockPrisma.teamMember.delete.mockResolvedValue({});
            mockPrisma.team.update.mockResolvedValue({});

            const res = await request(app)
                .delete('/api/v1/teams/team-1/members/user-2')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
        });

        it('should prevent owner from removing self', async () => {
            mockPrisma.team.findFirst.mockResolvedValue({ id: 'team-1', teamOwnerId: 'owner-1' });

            const res = await request(app)
                .delete('/api/v1/teams/team-1/members/owner-1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(400);
        });
    });

    describe('GET /api/v1/teams/:id/members', () => {
        it('should list team members', async () => {
            mockPrisma.team.findFirst.mockResolvedValue({ id: 'team-1', teamOwnerId: 'owner-1' });
            mockPrisma.teamMember.findMany.mockResolvedValue([
                { id: 'tm-1', userId: 'owner-1', user: { id: 'owner-1', name: 'Owner', email: 'owner@test.com', role: 'Admin' } },
            ]);

            const res = await request(app)
                .get('/api/v1/teams/team-1/members')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(1);
        });

        it('should return 404 for non-member team', async () => {
            mockPrisma.team.findFirst.mockResolvedValue(null);

            const res = await request(app)
                .get('/api/v1/teams/team-1/members')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });
    });

    describe('POST /api/v1/teams/invite', () => {
        it('should send team invitations', async () => {
            mockPrisma.team.findFirst.mockResolvedValue({ id: 'team-1', teamOwnerId: 'owner-1' });
            mockPrisma.user.findUnique.mockResolvedValue(null);
            mockPrisma.teamInvite.findFirst.mockResolvedValue(null);
            mockPrisma.teamInvite.create.mockResolvedValue({ id: 'inv-1', email: 'new@test.com', token: 'abc' });

            const res = await request(app)
                .post('/api/v1/teams/invite')
                .set('Authorization', `Bearer ${token}`)
                .send({ teamId: 'team-1', email: 'new@test.com' });

            expect(res.status).toBe(201);
            expect(res.body.data.results).toBeDefined();
        });
    });
});
