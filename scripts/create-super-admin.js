#!/usr/bin/env node
/**
 * Create (or reset) the Super Admin user.
 *
 * Usage (inside backend container):
 *   node scripts/create-super-admin.js
 *
 * Usage (from host via Docker):
 *   docker compose exec backend node scripts/create-super-admin.js
 *
 * NOTE: Uses argon2 — same library as auth.service.js — so the hashed
 * password is verifiable by the normal login flow. bcryptjs hashes will
 * NOT work with this backend.
 */

"use strict";

const argon2 = require("argon2");
const { PrismaClient } = require("@prisma/client");

const EMAIL = "superadmin@valuechart.com";
const PASSWORD = "SuperAdmin@2026";

const prisma = new PrismaClient();

async function main() {
  // 1 — Find the Super Admin role
  const role = await prisma.role.findFirst({ where: { title: "Super Admin" } });
  if (!role) {
    console.error('ERROR: Role "Super Admin" not found. Run autoSeed first:');
    console.error(
      "  docker compose exec backend node -e \"require('./src/lib/prisma')\"",
    );
    process.exit(1);
  }
  console.log(`Role found: "${role.title}" (id=${role.id})`);

  // 2 — Hash the password with argon2 (matches auth.service.js verification)
  const hashed = await argon2.hash(PASSWORD);
  console.log("Password hashed OK");

  // 3 — Upsert the user — safe to run multiple times
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      name: "Super Admin",
      password: hashed,
      userType: "admin",
      userStatus: "success",
      roleId: role.id,
      role: "Admin",
      emailVerified: new Date(),
      currentVersion: "free",
      hasPro: false,
      proFlowLimit: 10,
    },
    create: {
      email: EMAIL,
      name: "Super Admin",
      password: hashed,
      userType: "admin",
      userStatus: "success",
      roleId: role.id,
      role: "Admin",
      emailVerified: new Date(),
      currentVersion: "free",
      hasPro: false,
      proFlowLimit: 10,
    },
    select: {
      id: true,
      email: true,
      userType: true,
      userStatus: true,
      emailVerified: true,
      roleId: true,
    },
  });

  console.log("\nSuper admin ready:");
  console.log(`  id            : ${user.id}`);
  console.log(`  email         : ${user.email}`);
  console.log(`  userType      : ${user.userType}`);
  console.log(`  userStatus    : ${user.userStatus}`);
  console.log(`  emailVerified : ${user.emailVerified}`);
  console.log(`  roleId        : ${user.roleId}`);
  console.log(`\nLogin with: ${EMAIL} / ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error("\nFailed to create super admin:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
