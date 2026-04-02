const { prisma } = require('../lib/prisma');
const AppError = require('../utils/AppError');

class ShapeService {
    async getAllShapes(userId, appContext = 'free') {
        return await prisma.shape.findMany({
            where: {
                OR: [
                    { isPublic: true },
                    { ownerId: userId, appContext }
                ]
            },
            orderBy: { createdAt: 'desc' },
            include: { group: true }
        });
    }

    async getShapeById(id) {
        return await prisma.shape.findUnique({
            where: { id }
        });
    }

    async createShape(userId, data, appContext = 'free') {
        return await prisma.shape.create({
            data: {
                name: data.name,
                type: data.type,
                content: data.content,
                textAlignment: data.textAlignment,
                groupId: data.groupId,
                category: data.category,
                xmlContent: data.xmlContent,
                thumbnail: data.thumbnail,
                isPublic: data.isPublic || false,
                ownerId: userId,
                appContext,
            }
        });
    }

    async updateShape(id, userId, data) {
        const shape = await prisma.shape.findFirst({ where: { id, ownerId: userId } });
        if (!shape) throw new AppError('Shape not found', 404, 'NOT_FOUND');

        const updateData = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.type !== undefined) updateData.type = data.type;
        if (data.content !== undefined) updateData.content = data.content;
        if (data.textAlignment !== undefined) updateData.textAlignment = data.textAlignment;
        if (data.groupId !== undefined) updateData.groupId = data.groupId;
        if (data.category !== undefined) updateData.category = data.category;
        if (data.xmlContent !== undefined) updateData.xmlContent = data.xmlContent;
        if (data.thumbnail !== undefined) updateData.thumbnail = data.thumbnail;
        if (data.isPublic !== undefined) updateData.isPublic = data.isPublic;

        return await prisma.shape.update({
            where: { id },
            data: updateData
        });
    }

    async deleteShape(id, userId) {
        const shape = await prisma.shape.findFirst({ where: { id, ownerId: userId } });
        if (!shape) throw new AppError('Shape not found', 404, 'NOT_FOUND');

        return await prisma.shape.delete({
            where: { id }
        });
    }

    async getCategories() {
        const shapes = await prisma.shape.findMany({
            select: { category: true },
            distinct: ['category']
        });
        return shapes.map(s => s.category);
    }
}

module.exports = new ShapeService();
