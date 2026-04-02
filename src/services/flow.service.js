const { prisma } = require('../lib/prisma');
const produce = require('immer').produce;
const AppError = require('../utils/AppError');

class FlowService {
    async getAllFlows(userId, options = {}, appContext = 'free') {
        const { search, page = 1, limit = 10, nonEmpty, draftsOnly } = options;
        const take = Math.min(Number(limit) || 10, 100);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

        const where = {
            ownerId: userId,
            deletedAt: null,
            appContext,
        };

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }

        // Filter to non-empty flows only (has real diagram data)
        if (nonEmpty === 'true') {
            where.diagramData = {
                not: { in: ['', '{}', '<mxGraphModel></mxGraphModel>', '<mxGraphModel/>'] },
            };
        }

        // Filter to drafts only (empty or no diagram data)
        // Use AND to avoid overwriting search OR clause
        if (draftsOnly === 'true') {
            if (!where.AND) where.AND = [];
            where.AND.push({
                OR: [
                    { diagramData: null },
                    { diagramData: '' },
                    { diagramData: '{}' },
                    { diagramData: '<mxGraphModel></mxGraphModel>' },
                    { diagramData: '<mxGraphModel/>' },
                ],
            });
        }

        const [flows, total] = await Promise.all([
            prisma.flow.findMany({
                where,
                skip,
                take,
                orderBy: { updatedAt: 'desc' },
                include: {
                    project: {
                        select: { id: true, name: true },
                    },
                    _count: {
                        select: { flowShares: true },
                    },
                },
            }),
            prisma.flow.count({ where }),
        ]);

        // Flatten project name and share count onto flow objects
        const flowsWithProject = flows.map(f => ({
            ...f,
            projectName: f.project?.name || null,
            project: undefined,
            shareCount: f._count?.flowShares || 0,
            _count: undefined,
            accessType: 'owner',
        }));

        return { flows: flowsWithProject, total, page: Number(page) || 1, totalPages: Math.ceil(total / take) };
    }

    async getFlowById(id, userId) {
        return await prisma.flow.findFirst({
            where: { id, ownerId: userId },
        });
    }

    async createFlow(userId, data, appContext = 'free') {
        return await prisma.flow.create({
            data: {
                name: data.name,
                description: data.description,
                thumbnail: data.thumbnail,
                diagramData: data.xml || data.diagramData || '',
                isPublic: data.isPublic || false,
                ownerId: userId,
                projectId: data.projectId || null,
                appContext,
            },
        });
    }

    async updateFlow(id, userId, data) {
        const flow = await prisma.flow.findFirst({ where: { id, ownerId: userId, deletedAt: null } });
        if (!flow) throw new AppError('Flow not found', 404, 'NOT_FOUND');

        const updateData = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.thumbnail !== undefined) updateData.thumbnail = data.thumbnail;
        if (data.isPublic !== undefined) updateData.isPublic = data.isPublic;
        if (data.isFavorite !== undefined) updateData.isFavorite = data.isFavorite;
        if (data.projectId !== undefined) updateData.projectId = data.projectId;
        if (data.xml !== undefined) updateData.diagramData = data.xml;
        if (data.diagramData !== undefined) updateData.diagramData = data.diagramData;

        return await prisma.flow.update({
            where: { id },
            data: updateData,
        });
    }

    async deleteFlow(id, userId) {
        const flow = await prisma.flow.findFirst({ where: { id, ownerId: userId, deletedAt: null } });
        if (!flow) throw new AppError('Flow not found', 404, 'NOT_FOUND');

        return await prisma.flow.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }

    async getTrash(userId, options = {}, appContext = 'free') {
        const { page = 1, limit = 20 } = options;
        const take = Math.min(Number(limit) || 20, 100);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

        const where = { ownerId: userId, deletedAt: { not: null }, appContext };
        const [flows, total] = await Promise.all([
            prisma.flow.findMany({ where, skip, take, orderBy: { deletedAt: 'desc' } }),
            prisma.flow.count({ where }),
        ]);

        return { flows, total, page: Number(page) || 1, totalPages: Math.ceil(total / take) };
    }

    async restoreFlow(id, userId) {
        const result = await prisma.flow.updateMany({
            where: { id, ownerId: userId, deletedAt: { not: null } },
            data: { deletedAt: null },
        });
        if (result.count === 0) throw new AppError('Flow not found in trash', 404, 'NOT_FOUND');
        return result;
    }

    async permanentDeleteFlow(id, userId) {
        const result = await prisma.flow.deleteMany({
            where: { id, ownerId: userId, deletedAt: { not: null } },
        });
        if (result.count === 0) throw new AppError('Flow not found in trash', 404, 'NOT_FOUND');
        return result;
    }

    async purgeOldTrash(daysOld = 30) {
        const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
        return await prisma.flow.deleteMany({
            where: { deletedAt: { not: null, lt: cutoff } },
        });
    }

    async getFavorites(userId, appContext = 'free') {
        return await prisma.flow.findMany({
            where: { ownerId: userId, isFavorite: true, deletedAt: null, appContext },
            orderBy: { updatedAt: 'desc' },
            select: { id: true, name: true, thumbnail: true },
        });
    }

    async duplicateFlow(id, userId, appContext = 'free') {
        const original = await this.getFlowById(id, userId);
        if (!original) throw new AppError('Flow not found', 404, 'NOT_FOUND');

        return await prisma.flow.create({
            data: {
                name: `${original.name} (Copy)`,
                description: original.description,
                thumbnail: original.thumbnail,
                diagramData: original.diagramData,
                isPublic: original.isPublic,
                ownerId: original.ownerId,
                version: original.version,
                appContext,
            },
        });
    }

    // ==================== SHARING ====================

    async shareFlow(flowId, userId, shares, appContext = 'free') {
        // Verify flow belongs to current user
        const flow = await prisma.flow.findFirst({
            where: { id: flowId, ownerId: userId, deletedAt: null, appContext },
        });
        if (!flow) throw new AppError('Flow not found or not owned by you', 404, 'NOT_FOUND');

        // Get valid team member IDs
        const teamMembers = await prisma.teamMember.findMany({
            where: { userId },
            select: { teamId: true },
        });
        const teamIds = teamMembers.map(tm => tm.teamId);

        const validMembers = await prisma.teamMember.findMany({
            where: { teamId: { in: teamIds }, userId: { not: userId } },
            select: { userId: true },
        });
        const validIds = new Set(validMembers.map(m => m.userId));

        const results = [];
        for (const share of shares) {
            if (!validIds.has(share.userId)) {
                results.push({ userId: share.userId, error: 'User is not a team member' });
                continue;
            }
            if (share.userId === userId) {
                results.push({ userId: share.userId, error: 'Cannot share with yourself' });
                continue;
            }
            try {
                await prisma.flowShare.upsert({
                    where: { flowId_sharedWithId: { flowId, sharedWithId: share.userId } },
                    create: {
                        flowId,
                        sharedById: userId,
                        sharedWithId: share.userId,
                        permission: share.permission,
                        appContext,
                    },
                    update: { permission: share.permission },
                });
                results.push({ userId: share.userId, permission: share.permission, success: true });
            } catch (err) {
                results.push({ userId: share.userId, error: err.message });
            }
        }
        return results;
    }

    async getFlowShares(flowId, userId) {
        // Verify user is owner or has access
        const flow = await prisma.flow.findFirst({ where: { id: flowId, deletedAt: null } });
        if (!flow) throw new AppError('Flow not found', 404, 'NOT_FOUND');

        if (flow.ownerId !== userId) {
            const share = await prisma.flowShare.findFirst({
                where: { flowId, sharedWithId: userId },
            });
            if (!share) throw new AppError('Access denied', 403, 'FORBIDDEN');
        }

        return await prisma.flowShare.findMany({
            where: { flowId },
            include: {
                sharedWith: { select: { id: true, name: true, email: true, image: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async updateShare(flowId, shareId, userId, permission) {
        const flow = await prisma.flow.findFirst({
            where: { id: flowId, ownerId: userId, deletedAt: null },
        });
        if (!flow) throw new AppError('Only the flow owner can change permissions', 403, 'FORBIDDEN');

        const share = await prisma.flowShare.findFirst({ where: { id: shareId, flowId } });
        if (!share) throw new AppError('Share not found', 404, 'NOT_FOUND');

        return await prisma.flowShare.update({
            where: { id: shareId },
            data: { permission },
        });
    }

    async removeShare(flowId, shareId, userId) {
        const share = await prisma.flowShare.findFirst({ where: { id: shareId, flowId } });
        if (!share) throw new AppError('Share not found', 404, 'NOT_FOUND');

        const flow = await prisma.flow.findFirst({ where: { id: flowId } });
        if (flow.ownerId !== userId && share.sharedWithId !== userId) {
            throw new AppError('Access denied', 403, 'FORBIDDEN');
        }

        return await prisma.flowShare.delete({ where: { id: shareId } });
    }

    async getAvailableShareMembers(userId) {
        // Get all team members across all user's teams (deduplicated)
        const teamMembers = await prisma.teamMember.findMany({
            where: { userId },
            select: { teamId: true },
        });
        const teamIds = teamMembers.map(tm => tm.teamId);

        if (teamIds.length === 0) return [];

        const members = await prisma.teamMember.findMany({
            where: { teamId: { in: teamIds }, userId: { not: userId } },
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
        });

        // Deduplicate by user ID
        const seen = new Set();
        const unique = [];
        for (const m of members) {
            if (!seen.has(m.userId)) {
                seen.add(m.userId);
                unique.push(m.user);
            }
        }
        return unique;
    }

    async getSharedFlows(userId, appContext = 'free') {
        const shares = await prisma.flowShare.findMany({
            where: { sharedWithId: userId, appContext },
            include: {
                flow: {
                    include: {
                        project: { select: { id: true, name: true } },
                    },
                },
                sharedBy: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return shares
            .filter(s => s.flow && !s.flow.deletedAt)
            .map(s => ({
                ...s.flow,
                projectName: s.flow.project?.name || null,
                project: undefined,
                accessType: s.permission,
                sharedByName: s.sharedBy?.name || s.sharedBy?.email || 'Unknown',
                sharedByEmail: s.sharedBy?.email || null,
                shareId: s.id,
            }));
    }

    async getFlowByIdWithAccess(id, userId) {
        const flow = await prisma.flow.findFirst({
            where: { id, deletedAt: null },
        });
        if (!flow) return null;

        // Owner
        if (flow.ownerId === userId) {
            return { ...flow, permission: 'owner' };
        }

        // Shared user
        const share = await prisma.flowShare.findFirst({
            where: { flowId: id, sharedWithId: userId },
        });
        if (share) {
            return { ...flow, permission: share.permission };
        }

        return null;
    }

    async updateFlowWithAccess(id, userId, data) {
        const flow = await prisma.flow.findFirst({ where: { id, deletedAt: null } });
        if (!flow) throw new AppError('Flow not found', 404, 'NOT_FOUND');

        // Owner can always edit
        if (flow.ownerId === userId) {
            return await this.updateFlow(id, userId, data);
        }

        // Check shared edit permission
        const share = await prisma.flowShare.findFirst({
            where: { flowId: id, sharedWithId: userId, permission: 'edit' },
        });
        if (!share) throw new AppError('You have view-only access to this flow', 403, 'FORBIDDEN');

        const updateData = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.thumbnail !== undefined) updateData.thumbnail = data.thumbnail;
        if (data.xml !== undefined) updateData.diagramData = data.xml;
        if (data.diagramData !== undefined) updateData.diagramData = data.diagramData;

        return await prisma.flow.update({ where: { id }, data: updateData });
    }

    async duplicateSharedFlow(id, userId, appContext = 'free') {
        // Get the flow if user has access
        const flowData = await this.getFlowByIdWithAccess(id, userId);
        if (!flowData) throw new AppError('Flow not found', 404, 'NOT_FOUND');
        if (flowData.permission === 'view') throw new AppError('Cannot duplicate view-only flow', 403, 'FORBIDDEN');

        return await prisma.flow.create({
            data: {
                name: `${flowData.name} (Copy)`,
                description: flowData.description,
                thumbnail: flowData.thumbnail,
                diagramData: flowData.diagramData,
                isPublic: false,
                ownerId: userId,
                version: flowData.version,
                appContext,
            },
        });
    }

    // ==================== END SHARING ====================

    async updateDiagramState(id, userId, groupId, newShape) {
        const flow = await this.getFlowById(id, userId);
        if (!flow) throw new AppError('Flow not found', 404, 'NOT_FOUND');

        // Parse diagramData if stored as string
        let currentData = flow.diagramData || { groups: [] };
        if (typeof currentData === 'string') {
            try { currentData = JSON.parse(currentData); } catch { currentData = { groups: [] }; }
        }

        const updatedDiagramData = produce(currentData, draft => {
            let group = draft.groups.find(g => g.id === groupId);
            if (!group) {
                group = { id: groupId, children: [] };
                draft.groups.push(group);
            }
            group.children.push(newShape);
        });

        const serialized = typeof updatedDiagramData === 'string'
            ? updatedDiagramData
            : JSON.stringify(updatedDiagramData);

        await prisma.flow.update({
            where: { id },
            data: { diagramData: serialized },
        });

        return updatedDiagramData;
    }
}

module.exports = new FlowService();
