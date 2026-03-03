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
        const updateData = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.thumbnail !== undefined) updateData.thumbnail = data.thumbnail;
        if (data.isPublic !== undefined) updateData.isPublic = data.isPublic;
        if (data.xml !== undefined) updateData.diagramData = data.xml;
        if (data.diagramData !== undefined) updateData.diagramData = data.diagramData;

        return await prisma.flow.updateMany({
            where: { id, ownerId: userId },
            data: updateData,
        });
    }

    async deleteFlow(id, userId) {
        return await prisma.flow.deleteMany({
            where: { id, ownerId: userId },
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

        await prisma.flow.update({
            where: { id, ownerId: userId },
            data: { diagramData: updatedDiagramData },
        });

        return updatedDiagramData;
    }
}

module.exports = new FlowService();
