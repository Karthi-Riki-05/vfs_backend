const crypto = require("crypto");
const { prisma } = require("../lib/prisma");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

/**
 * Shared machinery for the native sign-in surface (`/api/v1/auth/native/*`).
 *
 * WHY THIS EXISTS
 *   Every native provider ends the same way — verify a provider credential the
 *   OS obtained, resolve it to a local account, and hand back a short-lived
 *   ticket the WebView redeems. Only the *verification* step differs. Keeping
 *   the shared half here stops Google and Facebook drifting apart on the parts
 *   that must stay identical: the account-state gate, the provider-link upsert,
 *   and how tickets are minted and stored.
 *
 * See docs/be-auth-native-google.md for the full flow.
 */

/** Lifetime of the hand-off ticket. Shared with biometric deliberately. */
const OTT_TTL_SECONDS = Number(process.env.BIOMETRIC_OTT_TTL_SECONDS || 60);

/** Opaque, high-entropy secret. Not a JWT: tickets must be revocable. */
function mintToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Reject an account that must not receive a session.
 *
 * Applied on every open endpoint so a provider login cannot outlive the
 * account's right to sign in — BUG-007 parity with login, refresh, biometric
 * and socialLogin.
 */
function assertUserLoginable(user, tag) {
  if (!user) {
    throw new AppError("Invalid or expired token", 401, "INVALID_TOKEN");
  }
  if (user.userStatus === "deleted") {
    throw new AppError("Account has been deactivated", 401, "USER_DEACTIVATED");
  }
  if (user.suspendedAt !== null && user.suspendedAt !== undefined) {
    logger.warn(`[${tag}] blocked — suspended: ${user.id}`);
    throw new AppError("Account is inactive", 401, "ACCOUNT_INACTIVE");
  }
}

/**
 * Find or create the account behind an already-VERIFIED provider identity.
 *
 * The caller must have checked the provider's signature/validity first — this
 * function trusts what it is given. Mirrors
 * mobile.auth.controller.js#socialLogin, including the subject-id fallback: an
 * account imported from the old app may carry a fabricated address, so a miss
 * on email is not proof this is a new person.
 */
async function resolveSocialUser({ provider, email, name, image, providerSub, tag }) {
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user && providerSub) {
    const link = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId: providerSub,
        },
      },
      include: { user: true },
    });
    user = link?.user || null;
  }

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: name || email.split("@")[0],
        image: image || null,
        role: "Viewer",
        // The provider has verified this address, so the new account starts
        // email-verified — consistent with the credentials gate.
        emailVerified: new Date(),
      },
    });
    logger.info(`[${tag}] user created: ${user.id}`);
  } else {
    const updates = {};
    if (!user.image && image) updates.image = image;
    if (!user.name && name) updates.name = name;
    if (Object.keys(updates).length > 0) {
      user = await prisma.user.update({ where: { id: user.id }, data: updates });
    }
  }

  // Keep the account reachable by subject id even if the provider later stops
  // sharing the address. Parity with the web oauthSync path.
  if (providerSub) {
    try {
      await prisma.account.upsert({
        where: {
          provider_providerAccountId: {
            provider,
            providerAccountId: providerSub,
          },
        },
        create: {
          userId: user.id,
          type: "oauth",
          provider,
          providerAccountId: providerSub,
        },
        update: { userId: user.id },
      });
    } catch (err) {
      // Non-fatal: the identity is already established.
      logger.warn(`[${tag}] account link upsert failed: ${err.message}`);
    }
  }

  return user;
}

/**
 * Mint the hand-off ticket.
 *
 * Rides the shared `biometric_otts` table on purpose: `consume` is already
 * source-agnostic (it needs a userId and a deviceId, nothing more), and a table
 * per provider would duplicate the atomic-claim logic that makes the hand-off
 * safe. `source` is prefixed onto the deviceId so a row's origin stays legible
 * in logs and in any later audit.
 */
async function issueLoginTicket({ userId, deviceId, source }) {
  const ticketDeviceId = `${source}:${
    typeof deviceId === "string" && deviceId.length > 0
      ? deviceId.slice(0, 120)
      : "unknown"
  }`;

  const ott = mintToken();
  await prisma.biometricOtt.create({
    data: {
      tokenHash: hashToken(ott),
      userId,
      deviceId: ticketDeviceId,
      expiresAt: new Date(Date.now() + OTT_TTL_SECONDS * 1000),
    },
  });

  return { ott, expiresIn: OTT_TTL_SECONDS };
}

module.exports = {
  OTT_TTL_SECONDS,
  mintToken,
  hashToken,
  assertUserLoginable,
  resolveSocialUser,
  issueLoginTicket,
};
