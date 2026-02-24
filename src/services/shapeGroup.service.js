const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class ShapeGroupService {
    async getAllGroups(userId) {
        return await prisma.shapeGroup.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: { _count: { select: { shapes: true } } }
        });
    }

    async createGroup(userId, data) {
        return await prisma.shapeGroup.create({
            data: {
                ...data,
                userId
            }
        });
    }
}

module.exports = new ShapeGroupService();
