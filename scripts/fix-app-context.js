#!/usr/bin/env node
// Backfill script to correctly set appContext = 'team' for data owned by Team subscribers
// incorrectly saved as 'free' due to default fallbacks.

const { prisma } = require("../src/lib/prisma");

async function fixAppContext() {
  console.log("Starting backfill for Team app users...");

  // 1. Identify Team app users (currentVersion = 'team')
  const teamUsers = await prisma.user.findMany({
    where: { currentVersion: "team" },
    select: { id: true }
  });
  
  if (teamUsers.length === 0) {
    console.log("No Team app users found.");
    return;
  }
  
  const userIds = teamUsers.map(u => u.id);
  console.log(`Found ${userIds.length} Team app users. Updating their data...`);

  // 2. Update Flows
  const flows = await prisma.flow.updateMany({
    where: { ownerId: { in: userIds }, appContext: "free" },
    data: { appContext: "team" }
  });
  console.log(`Updated ${flows.count} Flows to 'team'`);

  // 3. Update Projects
  const projects = await prisma.project.updateMany({
    where: { createdBy: { in: userIds }, appContext: "free" },
    data: { appContext: "team" }
  });
  console.log(`Updated ${projects.count} Projects to 'team'`);

  // 4. Update Shapes
  const shapes = await prisma.shape.updateMany({
    where: { ownerId: { in: userIds }, appContext: "free" },
    data: { appContext: "team" }
  });
  console.log(`Updated ${shapes.count} Shapes to 'team'`);

  // 5. Update ShapeGroups
  const shapeGroups = await prisma.shapeGroup.updateMany({
    where: { userId: { in: userIds }, appContext: "free" },
    data: { appContext: "team" }
  });
  console.log(`Updated ${shapeGroups.count} ShapeGroups to 'team'`);

  // 6. Update ChatGroups
  const chatGroups = await prisma.chatGroup.updateMany({
    where: { userId: { in: userIds }, appContext: "free" },
    data: { appContext: "team" }
  });
  console.log(`Updated ${chatGroups.count} ChatGroups to 'team'`);

  // 7. Update FlowShares (shared_by)
  const flowShares = await prisma.flowShare.updateMany({
    where: { sharedById: { in: userIds }, appContext: "free" },
    data: { appContext: "team" }
  });
  console.log(`Updated ${flowShares.count} FlowShares to 'team'`);

  // 8. Update any data associated with a team but accidentally marked free
  const teamContextFlows = await prisma.flow.updateMany({
    where: { teamId: { not: null }, appContext: "free", team: { appContext: "team" } },
    data: { appContext: "team" }
  });
  console.log(`Updated ${teamContextFlows.count} Team-assigned Flows to 'team'`);

  console.log("Backfill complete.");
}

fixAppContext()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
