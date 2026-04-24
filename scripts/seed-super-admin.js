/**
 * Grants super_admin role to a user by email.
 *
 * Usage (inside the backend container):
 *   docker compose exec backend node scripts/seed-super-admin.js <email>
 *
 * If no email is passed, falls back to SUPER_ADMIN_EMAIL env var.
 */
const { prisma } = require("../src/lib/prisma");

async function main() {
  const email = (process.argv[2] || process.env.SUPER_ADMIN_EMAIL || "").trim();

  if (!email) {
    console.error("Error: email is required");
    console.error("Usage: node scripts/seed-super-admin.js <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email: ${email}`);
    console.error("Create the user first (sign up via /signup), then retry.");
    process.exit(1);
  }

  if (user.role === "super_admin") {
    console.log(`User ${email} is already a super_admin. No changes made.`);
    process.exit(0);
  }

  const previousRole = user.role;
  const updated = await prisma.user.update({
    where: { email },
    data: { role: "super_admin" },
    select: { id: true, email: true, name: true, role: true },
  });

  console.log("Super admin role granted:");
  console.log(`  ID:    ${updated.id}`);
  console.log(`  Name:  ${updated.name}`);
  console.log(`  Email: ${updated.email}`);
  console.log(`  Role:  ${previousRole} → ${updated.role}`);
  console.log(
    "\nLog in (or refresh your session) and visit /super-admin/dashboard.",
  );
}

main()
  .catch((err) => {
    console.error("Failed to seed super admin:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
