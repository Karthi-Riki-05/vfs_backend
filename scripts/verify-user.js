#!/usr/bin/env node
/**
 * Mark a user as email-verified (sets emailVerified = now).
 * Also clears any pending verify token so the account is fully unlocked.
 *
 * Usage (inside backend container):
 *   node scripts/verify-user.js login@test.com
 *
 * Usage (from host via Docker):
 *   docker compose exec backend node scripts/verify-user.js login@test.com
 */

"use strict";

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: node scripts/verify-user.js <email>");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      userStatus: true,
    },
  });

  if (!existing) {
    console.error(`ERROR: No user found with email "${email}"`);
    process.exit(1);
  }

  console.log(
    `Found user: ${existing.name || "(no name)"} <${existing.email}>`,
  );
  console.log(
    `  emailVerified before : ${existing.emailVerified ?? "null (unverified)"}`,
  );
  console.log(`  userStatus before    : ${existing.userStatus}`);

  const updated = await prisma.user.update({
    where: { email },
    data: {
      emailVerified: new Date(),
      verifyToken: null,
      verifyTokenExpiresAt: null,
      userStatus: "success",
    },
    select: { id: true, email: true, emailVerified: true, userStatus: true },
  });

  console.log("\nUser verified:");
  console.log(`  emailVerified after  : ${updated.emailVerified}`);
  console.log(`  userStatus after     : ${updated.userStatus}`);
  console.log(`\n✓ ${email} can now log in.`);
}

main()
  .catch((err) => {
    console.error("\nFailed to verify user:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
