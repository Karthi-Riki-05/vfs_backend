const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Seed Roles
  const roles = [
    { title: 'Super Admin', legacyId: 1 },
    { title: 'Company Admin', legacyId: 2 },
    { title: 'Process Manager', legacyId: 3 },
    { title: 'User', legacyId: 4 },
    { title: 'Free user', legacyId: 5 },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { legacyId: role.legacyId },
      update: { title: role.title },
      create: role,
    });
  }
  console.log('Roles seeded: 5 rows');

  // 2. Seed Apps
  const apps = [
    { appName: 'valuechart_enterprise', dbName: 'ent_value_chart', legacyId: 1 },
    { appName: 'valuechart_individual', dbName: 'ind_value_chart', legacyId: 2 },
  ];

  for (const app of apps) {
    await prisma.app.upsert({
      where: { legacyId: app.legacyId },
      update: { appName: app.appName, dbName: app.dbName },
      create: app,
    });
  }
  console.log('Apps seeded: 2 rows');

  // 3. Seed Plans
  const plans = [
    {
      name: 'Free',
      duration: 'monthly',
      price: 0,
      status: 'active',
      tier: 0,
      features: JSON.stringify(['1 Flow', 'Basic shapes', 'Export PDF']),
    },
    {
      name: 'Pro Monthly',
      duration: 'monthly',
      price: 5,
      status: 'active',
      tier: 1,
      features: JSON.stringify(['10 Flows', 'All shapes', 'Export all formats', 'Priority support']),
    },
    {
      name: 'Pro Yearly',
      duration: 'yearly',
      price: 36,
      status: 'active',
      tier: 1,
      features: JSON.stringify(['10 Flows', 'All shapes', 'Export all formats', 'Priority support']),
    },
    {
      name: 'Team Monthly',
      duration: 'monthly',
      price: 5,
      status: 'active',
      tier: 2,
      appType: 'enterprise',
      userAccess: true,
      userCount: 5,
      userCost: 2.50,
      features: JSON.stringify(['Unlimited flows', 'Team collaboration', 'All shapes', 'Admin dashboard', 'Team management']),
    },
    {
      name: 'Team Yearly',
      duration: 'yearly',
      price: 36,
      status: 'active',
      tier: 2,
      appType: 'enterprise',
      userAccess: true,
      userCount: 5,
      userCost: 25.00,
      features: JSON.stringify(['Unlimited flows', 'Team collaboration', 'All shapes', 'Admin dashboard', 'Team management']),
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { name: plan.name },
      update: plan,
      create: plan,
    });
  }
  console.log('Plans seeded: 5 rows');

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
