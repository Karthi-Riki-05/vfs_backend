const { prisma } = require('../lib/prisma');
const argon2 = require('argon2');
const crypto = require('crypto');
const AppError = require('../utils/AppError');

class UserService {
    async getUserById(id) {
        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true, name: true, email: true, image: true, role: true,
                contactNo: true, photo: true, userType: true, userStatus: true,
                clientType: true, welcomeUser: true, chatEnabled: true,
                companyId: true, createdAt: true, updatedAt: true,
            },
        });
        if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
        return user;
    }

    async updateUser(id, data) {
        const updateData = {};
        if (data.name !== undefined) {
            if (!data.name || !data.name.trim()) {
                throw new AppError('Name cannot be empty', 400, 'VALIDATION_ERROR');
            }
            updateData.name = data.name.trim();
        }
        if (data.email !== undefined) {
            const existing = await prisma.user.findUnique({ where: { email: data.email } });
            if (existing && existing.id !== id) {
                throw new AppError('Email already in use', 409, 'CONFLICT');
            }
            updateData.email = data.email;
        }
        if (data.contactNo !== undefined) updateData.contactNo = data.contactNo;
        if (data.photo !== undefined) updateData.photo = data.photo;
        if (data.welcomeUser !== undefined) updateData.welcomeUser = data.welcomeUser;

        return await prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true, name: true, email: true, image: true, role: true,
                contactNo: true, photo: true, userType: true, userStatus: true,
                clientType: true, welcomeUser: true, chatEnabled: true,
                companyId: true, createdAt: true, updatedAt: true,
            },
        });
    }

    async changePassword(userId, currentPassword, newPassword) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.password) {
            throw new AppError('Cannot change password for OAuth accounts', 400, 'BAD_REQUEST');
        }
        const valid = await argon2.verify(user.password, currentPassword);
        if (!valid) throw new AppError('Current password is incorrect', 401, 'INVALID_CREDENTIALS');

        const hashed = await argon2.hash(newPassword);
        await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
    }

    async requestPasswordReset(email) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return; // Don't reveal if user exists
        const token = crypto.randomBytes(32).toString('hex');
        await prisma.passwordReset.create({ data: { email, token } });
        // In production: send email with reset link containing this token
        return token;
    }

    async resetPassword(token, newPassword) {
        const reset = await prisma.passwordReset.findFirst({
            where: { token },
            orderBy: { createdAt: 'desc' },
        });
        if (!reset) throw new AppError('Invalid or expired reset token', 400, 'INVALID_TOKEN');

        // Check token age (1 hour expiry)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (reset.createdAt < oneHourAgo) {
            throw new AppError('Reset token has expired', 400, 'TOKEN_EXPIRED');
        }

        const hashed = await argon2.hash(newPassword);
        await prisma.user.update({ where: { email: reset.email }, data: { password: hashed } });
        // Clean up used tokens
        await prisma.passwordReset.deleteMany({ where: { email: reset.email } });
    }

    async softDeleteUser(id) {
        return await prisma.user.update({
            where: { id },
            data: { userStatus: 'deleted' },
        });
    }
}

module.exports = new UserService();
