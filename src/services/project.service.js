const { prisma } = require('../lib/prisma');
const AppError = require('../utils/AppError');

class ProjectService {
    async getAllProjects(userId, options = {}, appContext = 'free') {
        const { search } = options;

        const where = {
            createdBy: userId,
            deletedAt: null,
            appContext,
        };

        if (search) {
            where.name = { contains: search, mode: 'insensitive' };
        }

        const projects = await prisma.project.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            include: {
                _count: {
                    select: {
                        flows: {
                            where: { deletedAt: null },
                        },
                    },
                },
            },
        });

        return projects.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            coverImage: p.coverImage,
            createdBy: p.createdBy,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            flowCount: p._count.flows,
        }));
    }

    async getProjectById(id, userId, appContext) {
        const where = { id, createdBy: userId, deletedAt: null };
        if (appContext) where.appContext = appContext;
        const project = await prisma.project.findFirst({ where });
        if (!project) throw new AppError('Project not found', 404, 'NOT_FOUND');
        return project;
    }

    async getProjectWithFlows(id, userId, options = {}, appContext = 'free') {
        const { search, page = 1, limit = 50 } = options;
        const project = await this.getProjectById(id, userId);

        const take = Math.min(Number(limit) || 50, 100);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

        const flowWhere = {
            projectId: id,
            ownerId: userId,
            deletedAt: null,
            appContext,
        };

        if (search) {
            flowWhere.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [flows, total] = await Promise.all([
            prisma.flow.findMany({
                where: flowWhere,
                skip,
                take,
                orderBy: { updatedAt: 'desc' },
            }),
            prisma.flow.count({ where: flowWhere }),
        ]);

        return {
            ...project,
            flows,
            total,
            page: Number(page) || 1,
            totalPages: Math.ceil(total / take),
        };
    }

    async createProject(userId, data, appContext = 'free') {
        return await prisma.project.create({
            data: {
                name: data.name,
                description: data.description || null,
                createdBy: userId,
                appContext,
            },
        });
    }

    async updateProject(id, userId, data) {
        const project = await this.getProjectById(id, userId);

        const updateData = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined) updateData.description = data.description;

        return await prisma.project.update({
            where: { id },
            data: updateData,
        });
    }

    async deleteProject(id, userId) {
        const project = await this.getProjectById(id, userId);

        // Unassign all flows from this project (do NOT delete flows)
        await prisma.flow.updateMany({
            where: { projectId: id, ownerId: userId },
            data: { projectId: null },
        });

        // Soft delete the project
        return await prisma.project.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }

    async assignFlow(projectId, userId, flowId) {
        // Verify project belongs to user
        await this.getProjectById(projectId, userId);

        // Verify flow belongs to user
        const flow = await prisma.flow.findFirst({
            where: { id: flowId, ownerId: userId, deletedAt: null },
        });
        if (!flow) throw new AppError('Flow not found', 404, 'NOT_FOUND');

        return await prisma.flow.update({
            where: { id: flowId },
            data: { projectId },
        });
    }

    async unassignFlow(projectId, userId, flowId) {
        // Verify project belongs to user
        await this.getProjectById(projectId, userId);

        // Verify flow belongs to user and is in this project
        const flow = await prisma.flow.findFirst({
            where: { id: flowId, ownerId: userId, projectId, deletedAt: null },
        });
        if (!flow) throw new AppError('Flow not found in this project', 404, 'NOT_FOUND');

        return await prisma.flow.update({
            where: { id: flowId },
            data: { projectId: null },
        });
    }
}

module.exports = new ProjectService();
