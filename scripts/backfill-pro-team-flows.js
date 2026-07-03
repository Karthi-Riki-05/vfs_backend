#!/usr/bin/env node
// Fixes Pro users whose flows are stranded at teamId=NULL (created before
// Pro team isolation was introduced). For each affected user:
//   1. Creates a Pro team (appContext='pro') if one doesn't exist.
//   2. Reassigns all their teamId=NULL flows to that Pro team.
//   3. Updates appContext on those flows to 'pro'.
//
// Safe to run multiple times — skips users who already have a Pro team
// and flows already assigned to one.

const { prisma } = require("../src/lib/prisma");

async function run() {
  console.log("=== backfill-pro-team-flows ===\n");

  // Find all Pro users who have at least one active flow with teamId=null.
  const affectedUsers = await prisma.user.findMany({
    where: {
      currentVersion: "pro",
      flows: {
        some: { teamId: null, deletedAt: null },
      },
    },
    select: { id: true, email: true },
  });

  if (affectedUsers.length === 0) {
    console.log("No affected users found. Nothing to do.");
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${affectedUsers.length} affected user(s):\n`);

  let totalTeamsCreated = 0;
  let totalFlowsReassigned = 0;

  for (const user of affectedUsers) {
    console.log(`User: ${user.email} (${user.id})`);

    // Check if Pro team already exists for this user.
    let proTeam = await prisma.team.findFirst({
      where: { teamOwnerId: user.id, appContext: "pro", deletedAt: null },
      select: { id: true, name: true },
    });

    if (proTeam) {
      console.log(
        `  Pro team already exists: ${proTeam.id} — skipping team creation`,
      );
    } else {
      proTeam = await prisma.team.create({
        data: {
          name: "My Pro Workspace",
          teamOwnerId: user.id,
          appContext: "pro",
          status: "active",
        },
      });
      totalTeamsCreated++;
      console.log(`  Created Pro team: ${proTeam.id}`);
    }

    // Reassign all teamId=null flows (active + soft-deleted) to the Pro team.
    const result = await prisma.flow.updateMany({
      where: {
        ownerId: user.id,
        teamId: null,
      },
      data: {
        teamId: proTeam.id,
        appContext: "pro",
      },
    });

    totalFlowsReassigned += result.count;
    console.log(`  Reassigned ${result.count} flow(s) to Pro team\n`);
  }

  console.log("=== Summary ===");
  console.log(`Users processed:    ${affectedUsers.length}`);
  console.log(`Teams created:      ${totalTeamsCreated}`);
  console.log(`Flows reassigned:   ${totalFlowsReassigned}`);

  await prisma.$disconnect();
}

run().catch((err) => {
  console.error("Error:", err.message);
  prisma.$disconnect();
  process.exit(1);
});
