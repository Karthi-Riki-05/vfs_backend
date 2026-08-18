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
        // Selected only to derive `hasPassword` below — the hash is stripped
        // before returning. Lets the client show a password prompt for
        // credentials users and a "type DELETE" confirm for OAuth users.
        password: true,
      },
    });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
    const hasTeamAccess = await this.getHasTeamAccess(id);
    const { password, ...safe } = user;
    return { ...safe, hasTeamAccess, hasPassword: !!password };
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
      // bug-U3: same session invalidation as resetPassword.
      data: {
        password: hashed,
        refreshToken: null,
        passwordChangedAt: new Date(),
      },
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
    // bug-M8: store only the HASH of the reset token. The plaintext lives solely
    // in the emailed URL, so a DB read no longer yields usable 1-hour tokens.
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Delete any existing tokens for this email, then create new one
    await prisma.passwordReset.deleteMany({ where: { email } });
    await prisma.passwordReset.create({ data: { email, token: tokenHash } });

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
    // bug-M8: tokens are stored hashed — look up by the hash of the presented
    // plaintext token from the reset URL.
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const reset = await prisma.passwordReset.findFirst({
      where: { token: tokenHash },
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

    // bug-M9: a deleted/suspended account must not silently rotate its password
    // (login gates block it either way, but the reset should refuse outright).
    const target = await prisma.user.findUnique({
      where: { email: reset.email },
      select: { userStatus: true, suspendedAt: true },
    });
    if (
      !target ||
      target.userStatus === "deleted" ||
      target.suspendedAt !== null
    ) {
      throw new AppError("Account is inactive", 403, "ACCOUNT_INACTIVE");
    }

    const hashed = await argon2.hash(newPassword);
    const updated = await prisma.user.update({
      where: { email: reset.email },
      // bug-U3: invalidate existing sessions. Null the mobile refresh token and
      // bump passwordChangedAt so pre-reset web JWTs are rejected — otherwise a
      // stolen token survives the reset the email claims restores access.
      data: {
        password: hashed,
        refreshToken: null,
        passwordChangedAt: new Date(),
      },
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
