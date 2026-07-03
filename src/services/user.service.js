const { prisma } = require("../lib/prisma");
const argon2 = require("argon2");
const crypto = require("crypto");
const AppError = require("../utils/AppError");
const { sendPasswordResetEmail } = require("../utils/email");
const logger = require("../utils/logger");
const securityAlert = require("./securityAlert.service");

class UserService {
  /**
   * Live-recompute team access from the Subscription table — never trust a
   * cached claim (JWT, session, etc.) for this. "cancelling" = cancel_at_-
   * period_end set; user keeps access until expiresAt. See bug-033.
   */
  async getHasTeamAccess(userId) {
    const teamSub = await prisma.subscription.findFirst({
      where: {
        userId,
        productType: { in: ["team_monthly", "team_yearly"] },
        status: { in: ["active", "cancelling"] },
      },
      select: { id: true, expiresAt: true },
    });
    return (
      !!teamSub &&
      (!teamSub.expiresAt || new Date(teamSub.expiresAt) > new Date())
    );
  }

  async getUserById(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        contactNo: true,
        photo: true,
        userType: true,
        userStatus: true,
        clientType: true,
        welcomeUser: true,
        chatEnabled: true,
        companyId: true,
        createdAt: true,
        updatedAt: true,
        hasPro: true,
        currentVersion: true,
      },
    });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
    const hasTeamAccess = await this.getHasTeamAccess(id);
    return { ...user, hasTeamAccess };
  }

  async updateUser(id, data) {
    const updateData = {};
    if (data.name !== undefined) {
      if (!data.name || !data.name.trim()) {
        throw new AppError("Name cannot be empty", 400, "VALIDATION_ERROR");
      }
      updateData.name = data.name.trim();
    }
    if (data.email !== undefined) {
      const existing = await prisma.user.findUnique({
        where: { email: data.email },
      });
      if (existing && existing.id !== id) {
        throw new AppError("Email already in use", 409, "CONFLICT");
      }
      updateData.email = data.email;
    }
    if (data.contactNo !== undefined) updateData.contactNo = data.contactNo;
    if (data.photo !== undefined) updateData.photo = data.photo;
    if (data.welcomeUser !== undefined)
      updateData.welcomeUser = data.welcomeUser;

    return await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        contactNo: true,
        photo: true,
        userType: true,
        userStatus: true,
        clientType: true,
        welcomeUser: true,
        chatEnabled: true,
        companyId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async changePassword(userId, currentPassword, newPassword, ip, userAgent) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.password) {
      throw new AppError(
        "Cannot change password for OAuth accounts",
        400,
        "BAD_REQUEST",
      );
    }
    const valid = await argon2.verify(user.password, currentPassword);
    if (!valid)
      throw new AppError(
        "Current password is incorrect",
        401,
        "INVALID_CREDENTIALS",
      );

    const hashed = await argon2.hash(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    securityAlert.alertPasswordChanged({
      userId: user.id,
      email: user.email,
      name: user.name,
      ip,
      userAgent,
    });
  }

  async requestPasswordReset(email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return; // Don't reveal if user exists

    const token = crypto.randomBytes(32).toString("hex");

    // Delete any existing tokens for this email, then create new one
    await prisma.passwordReset.deleteMany({ where: { email } });
    await prisma.passwordReset.create({ data: { email, token } });

    // Build reset URL and send email
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    try {
      await sendPasswordResetEmail({ to: email, name: user.name, resetUrl });
    } catch (err) {
      logger.error(
        `Failed to send password reset email to ${email}: ${err.message}`,
      );
      // Don't throw — we don't want to reveal if email exists
    }
  }

  async resetPassword(token, newPassword, ip, userAgent) {
    const reset = await prisma.passwordReset.findFirst({
      where: { token },
      orderBy: { createdAt: "desc" },
    });
    if (!reset)
      throw new AppError(
        "Invalid or expired reset token",
        400,
        "INVALID_TOKEN",
      );

    // Check token age (1 hour expiry)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (reset.createdAt < oneHourAgo) {
      throw new AppError("Reset token has expired", 400, "TOKEN_EXPIRED");
    }

    const hashed = await argon2.hash(newPassword);
    const updated = await prisma.user.update({
      where: { email: reset.email },
      data: { password: hashed },
      select: { id: true, email: true, name: true },
    });
    // Clean up used tokens
    await prisma.passwordReset.deleteMany({ where: { email: reset.email } });

    securityAlert.alertPasswordChanged({
      userId: updated.id,
      email: updated.email,
      name: updated.name,
      ip,
      userAgent,
    });
  }

  async softDeleteUser(id) {
    return await prisma.user.update({
      where: { id },
      data: { userStatus: "deleted" },
    });
  }
}

module.exports = new UserService();
