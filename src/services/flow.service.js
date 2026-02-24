const { prisma } = require('../lib/prisma');
const produce = require('immer').produce;

class FlowService {
    async getAllFlows(userId, options = {}) {
        const { search, page = 1, limit = 10 } = options;
        const skip = (page - 1) * limit;

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
                take: Number(limit),
                orderBy: { updatedAt: 'desc' },
            }),
            prisma.flow.count({ where }),
        ]);

        return { flows, total, page, totalPages: Math.ceil(total / limit) };
    }

    async getFlowById(id, userId) {
        return await prisma.flow.findFirst({
            where: { id, ownerId: userId },
        });
    }

    async createFlow(userId, data) {
        return await prisma.flow.create({
            data: {
                ...data,
                diagramData: data.xml || data.diagramData || "",
                ownerId: userId,
            },
        });

    }

    async updateFlow(id, userId, data) {
        const updateData = { ...data };
        if (data.xml) {
            updateData.diagramData = data.xml;
            delete updateData.xml;
        }
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
        if (!original) throw new Error('Flow not found');

        const { id: _, createdAt: __, updatedAt: ___, ...rest } = original;
        return await prisma.flow.create({
            data: {
                ...rest,
                name: `${original.name} (Copy)`,
            },
        });
    }

    async updateDiagramState(id, userId, groupId, newShape) {
        const flow = await this.getFlowById(id, userId);
        if (!flow) throw new Error('Flow not found');

        const updatedDiagramData = produce(flow.diagramData || { groups: [] }, draft => {
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
