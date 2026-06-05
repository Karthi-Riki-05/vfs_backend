/**
 * Creates standard test users for all environments.
 *
 * IMPORTANT — this file lives at project-root .claude/, which is NOT mounted
 * into the backend container (only ./backend is mounted at /app). It also needs
 * `argon2` + `@prisma/client`, which only exist inside the backend container.
 * So run it by copying it into the container first:
 *
 *   docker compose cp .claude/setup-test-users.js backend:/app/setup-test-users.js
 *   docker compose exec backend node setup-test-users.js
 *
 * (For dev/prod add `-f docker-compose.server.yml` to both commands.)
 *
 * Safe to run multiple times (uses upsert).
 *
 * Corrections vs. the original spec:
 *   - Uses argon2 (the project's hasher) — NOT bcryptjs (not installed; argon2.verify
 *     cannot validate a bcrypt hash, so logins would fail).
 *   - Matches the real Prisma User schema: there is no `isVerified` or `status`
 *     field. Login (`/auth/validate`) requires emailVerified set, userStatus !=
 *     'deleted', and suspendedAt = null. `role` is a String ("Viewer"|"Editor"|
 *     "Admin"); `userType` is an enum (free_user|pro_user|admin).
 *   - Does NOT create Team/TeamMember/Subscription rows — only user version flags.
 */

const { PrismaClient } = require("@prisma/client");
const argon2 = require("argon2");
const prisma = new PrismaClient();

// role  → schema `role` String (app-level: Viewer/Editor/Admin)
// type  → schema `userType` enum (free_user/pro_user/admin)
// version → schema `currentVersion` enum (free/pro/team)
const TEST_USERS = [
  {
    email: "freeuser@valueflowtest.com",
    name: "Free User",
    currentVersion: "free",
    userType: "free_user",
    role: "Viewer",
    hasPro: false,
  },
  {
    email: "prouser@valueflowtest.com",
    name: "Pro User",
    currentVersion: "pro",
    userType: "pro_user",
    role: "Viewer",
    hasPro: true,
  },
  {
    email: "teamowner@valueflowtest.com",
    name: "Team Owner",
    currentVersion: "team",
    userType: "pro_user",
    role: "Viewer",
    hasPro: true,
  },
  {
    email: "teammember@valueflowtest.com",
    name: "Team Member",
    currentVersion: "team",
    userType: "pro_user",
    role: "Viewer",
    hasPro: true,
  },
  {
    email: "admin@valueflowtest.com",
    name: "Admin User",
    currentVersion: "free",
    userType: "admin",
    role: "Admin",
    hasPro: false,
  },
];

async function setupTestUsers() {
  console.log("=== Setting up test users ===\n");
  const hash = await argon2.hash("Test@1234");

  for (const u of TEST_USERS) {
    const shared = {
      name: u.name,
      currentVersion: u.currentVersion,
      userType: u.userType,
      role: u.role,
      hasPro: u.hasPro,
      // Login gates — these MUST be satisfied for /auth/validate to succeed:
      emailVerified: new Date(),
      userStatus: "success",
      suspendedAt: null,
    };

    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: shared,
      create: {
        email: u.email,
        password: hash,
        ...shared,
      },
    });

    console.log(
      `OK  ${u.role.padEnd(8)} ${u.currentVersion.padEnd(5)} -> ${user.email}`,
    );
  }

  console.log("\nAll test users ready. Password for all: Test@1234");
  await prisma.$disconnect();
}

setupTestUsers().catch(async (err) => {
  console.error("Setup failed:", err.message);
  await prisma.$disconnect();
  process.exit(1);
});
