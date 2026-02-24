const { prisma } = require('../lib/prisma');

class ShapeService {
    async getAllShapes(userId) {
        return await prisma.shape.findMany({
            where: {
                OR: [
                    { isPublic: true },
                    { ownerId: userId }
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

    async createShape(userId, data) {
        return await prisma.shape.create({
            data: {
                ...data,
                ownerId: userId
            }
        });
    }

    async updateShape(id, userId, data) {
        return await prisma.shape.updateMany({
            where: { id, ownerId: userId },
            data
        });
    }

    async deleteShape(id, userId) {
        return await prisma.shape.deleteMany({
            where: { id, ownerId: userId }
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
