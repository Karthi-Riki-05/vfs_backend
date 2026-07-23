const { prisma } = require("../lib/prisma");
const argon2 = require("argon2");
const AppError = require("../utils/AppError");
const { getStripe } = require("../lib/stripe");
const logger = require("../utils/logger");

class AccountService {
  async deleteAccount(userId) {
    // 1. Load user with all data needed for deletion
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        password: true,
        role: true,
        stripeCustomerId: true,
        flowAddonStripeSubId: true,
        subscription: {
          select: { id: true, paymentId: true },
        },
        ownedTeams: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            _count: { select: { members: true } },
          },
        },
      },
    });

    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");

    // 2. Block admin self-deletion
    if (user.role === "Admin" || user.role === "SuperAdmin") {
      throw new AppError(
        "Admin accounts cannot be self-deleted. Contact a super-admin.",
        403,
        "ADMIN_DELETION_BLOCKED",
      );
    }

    // 3. Split owned teams: block only teams with other members.
    //    Sole-owner teams (only the owner is a member) are auto-dissolved.
    const teamsWithOtherMembers = user.ownedTeams.filter(
      (t) => t._count.members > 1,
    );
    const soleOwnerTeams = user.ownedTeams.filter((t) => t._count.members <= 1);

    if (teamsWithOtherMembers.length > 0) {
      const teamNames = teamsWithOtherMembers.map((t) => t.name).join(", ");
      throw new AppError(
        `You must delete or transfer your teams before deleting your account: ${teamNames}`,
        400,
        "TEAMS_MUST_BE_HANDLED",
      );
    }

    // 4. Cancel + clean up Stripe BEFORE touching the DB.
    //    If Stripe fails we abort — never orphan a paying Stripe customer.
    await this._cancelStripeSubscriptions(user);

    // 5. Delete user inside a transaction.
    //    Subscription has no onDelete cascade so we must remove it manually first.
    await prisma.$transaction(async (tx) => {
      // Auto-dissolve sole-owner teams first — their TeamMember rows cascade
      // automatically. Flows owned by the user are cleaned up by user.delete below.
      for (const team of soleOwnerTeams) {
        await tx.team.delete({ where: { id: team.id } });
      }

      // Remove subscription row (no Cascade FK — would block user delete)
      if (user.subscription) {
        await tx.subscription.delete({
          where: { id: user.subscription.id },
        });
      }

      // Remove password-reset tokens (linked by email, not FK)
      await tx.passwordReset.deleteMany({ where: { email: user.email } });

      // Hard-delete the user — all Cascade relations fire automatically:
      // Account, Session, FirebaseUser, UserDevice, Flow (ownerId),
      // FlowVersion, FlowGroupUser, FlowLimit, FlowPublish, FlowShare,
      // ShapeGroup, Shape, ChatGroup, ChatGroupUser, ChatMessage,
      // MessageReaction, SubscriptionHistory, SubscriptionQueue,
      // AddUserSubscription, UserFreeTrial, ProFlowPurchase, Project,
      // Notification, AiConsent, AiConversation, AiJob,
      // AiCreditBalance, AiCreditUsage, VsmOption, UserInterest,
      // UserAction, FeedbackQuery.
      // TransactionLog.userId → SetNull (financial records survive de-identified)
      // AdminLog.targetUserId → SetNull (admin audit trail survives)
      await tx.user.delete({ where: { id: userId } });
    });

    logger.info(`Account permanently deleted: userId=${userId}`);
  }

  async verifyPassword(userId, password) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
    if (!user.password) {
      throw new AppError(
        "Cannot delete OAuth accounts via password confirmation. Contact support.",
        400,
        "OAUTH_ACCOUNT",
      );
    }
    const valid = await argon2.verify(user.password, password);
    if (!valid) {
      throw new AppError("Password is incorrect", 401, "INVALID_CREDENTIALS");
    }
  }

  // Authorize an account deletion. Credentials users (have a password) must
  // pass their password; OAuth/social users (no password — Google/Facebook/etc)
  // have nothing to verify, so they confirm by typing "DELETE" instead. This
  // lets social-login users self-delete (previously blocked with OAUTH_ACCOUNT).
  async verifyDeleteAuthorization(userId, { password, confirmation } = {}) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");

    if (user.password) {
      // Credentials account — require the correct password.
      if (!password) {
        throw new AppError("Password is required", 400, "PASSWORD_REQUIRED");
      }
      const valid = await argon2.verify(user.password, password);
      if (!valid) {
        throw new AppError("Password is incorrect", 401, "INVALID_CREDENTIALS");
      }
      return;
    }

    // OAuth/social account — no password to verify. Require the typed
    // "DELETE" confirmation (case-insensitive, trimmed) as the safeguard.
    if ((confirmation || "").trim().toUpperCase() !== "DELETE") {
      throw new AppError(
        'Type "DELETE" to confirm deleting your account.',
        400,
        "CONFIRMATION_REQUIRED",
      );
    }
  }

  async _cancelStripeSubscriptions(user) {
    let stripe;
    try {
      stripe = getStripe();
    } catch {
      // Stripe not configured (e.g. test env) — skip silently
      return;
    }

    // Cancel team subscription
    if (user.subscription?.paymentId) {
      try {
        await stripe.subscriptions.cancel(user.subscription.paymentId);
      } catch (err) {
        // Already cancelled or not found — not a blocking error
        if (err?.raw?.code !== "resource_missing") {
          throw new AppError(
            `Failed to cancel subscription before deletion: ${err.message}`,
            502,
            "STRIPE_CANCEL_FAILED",
          );
        }
      }
    }

    // Cancel flow-addon subscription
    if (user.flowAddonStripeSubId) {
      try {
        await stripe.subscriptions.cancel(user.flowAddonStripeSubId);
      } catch (err) {
        if (err?.raw?.code !== "resource_missing") {
          throw new AppError(
            `Failed to cancel flow addon before deletion: ${err.message}`,
            502,
            "STRIPE_CANCEL_FAILED",
          );
        }
      }
    }

    // Delete Stripe customer (removes PII from Stripe — GDPR erasure)
    if (user.stripeCustomerId) {
      try {
        await stripe.customers.del(user.stripeCustomerId);
      } catch (err) {
        if (err?.raw?.code !== "resource_missing") {
          throw new AppError(
            `Failed to delete Stripe customer before deletion: ${err.message}`,
            502,
            "STRIPE_CANCEL_FAILED",
          );
        }
      }
    }
  }
}

module.exports = new AccountService();
