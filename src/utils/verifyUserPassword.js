const argon2 = require("argon2");
const bcryptjs = require("bcryptjs");
const { prisma } = require("../lib/prisma");
const logger = require("./logger");

/**
 * The single place that knows how to check a password against a stored hash.
 *
 * Accounts imported from the old Laravel app carry a `$2y$` bcrypt hash and are
 * flagged `isLegacyBcrypt`. `argon2.verify` does not throw on those — it returns
 * `false`, which reads as an ordinary wrong password and never reaches the error
 * logs. That made every call site that forgot the legacy branch fail silently:
 * mobile login, change-password and delete-account all rejected the correct
 * password until the user happened to log in on the web first.
 *
 * Verification branches on the COLUMN, never on the hash prefix (parity with the
 * rule documented in docs/be-auth.md §5). On a successful legacy match the hash
 * is upgraded to argon2 and the flag cleared, so the bcrypt path runs at most
 * once per account.
 *
 * @param {{id: string, password: string|null, isLegacyBcrypt?: boolean}} user
 *   Must be selected with `id`, `password` AND `isLegacyBcrypt` — a partial
 *   select that omits the flag silently reintroduces the bug.
 * @param {string} plain
 * @returns {Promise<boolean>}
 */
async function verifyUserPassword(user, plain) {
  if (!user || !user.password || !plain) return false;

  if (!user.isLegacyBcrypt) {
    return await argon2.verify(user.password, plain);
  }

  // $2y$ (PHP/Laravel bcrypt) — bcryptjs handles the prefix natively.
  const isValid = await bcryptjs.compare(plain, user.password);
  if (!isValid) return false;

  // Rehash so the next login is native. Never fatal: the caller has already
  // authenticated, and failing the upgrade must not fail the sign-in.
  try {
    const newHash = await argon2.hash(plain);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: newHash, isLegacyBcrypt: false },
    });
  } catch (err) {
    logger.error(
      `Legacy bcrypt upgrade failed for ${user.id}: ${err.message}`,
    );
  }
  return true;
}

module.exports = { verifyUserPassword };
