const { prisma } = require('../lib/prisma');
const produce = require('immer').produce;
const AppError = require('../utils/AppError');

class FlowService {
    async getAllFlows(userId, options = {}) {
        const { search, page = 1, limit = 10 } = options;
        const take = Math.min(Number(limit) || 10, 100);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

        const where = {
            ownerId: userId,
            deletedAt: null,
        };

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [flows, total] = await Promise.all([
            prisma.flow.findMany({
                where,
                skip,
                take,
                orderBy: { updatedAt: 'desc' },
            }),
            prisma.flow.count({ where }),
        ]);

        return { flows, total, page: Number(page) || 1, totalPages: Math.ceil(total / take) };
    }

    async getFlowById(id, userId) {
        return await prisma.flow.findFirst({
            where: { id, ownerId: userId },
        });
    }

    async createFlow(userId, data) {
        return await prisma.flow.create({
            data: {
                name: data.name,
                description: data.description,
                thumbnail: data.thumbnail,
                diagramData: data.xml || data.diagramData || '',
                isPublic: data.isPublic || false,
                ownerId: userId,
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

    async getTrash(userId, options = {}) {
        const { page = 1, limit = 20 } = options;
        const take = Math.min(Number(limit) || 20, 100);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

        const where = { ownerId: userId, deletedAt: { not: null } };
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

    async getFavorites(userId) {
        return await prisma.flow.findMany({
            where: { ownerId: userId, isFavorite: true, deletedAt: null },
            orderBy: { updatedAt: 'desc' },
            select: { id: true, name: true, thumbnail: true },
        });
    }

    async duplicateFlow(id, userId) {
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
            },
        });
    }

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
