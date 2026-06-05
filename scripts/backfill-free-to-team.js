#!/usr/bin/env node
"use strict";

const { prisma } = require("../src/lib/prisma");

async function backfill() {
  console.log("Backfilling app_context from 'free' to 'team'...");

  const flows = await prisma.flow.updateMany({
    where: { appContext: "free" },
    data: { appContext: "team" },
  });
  console.log(`flows: ${flows.count} updated`);

  const projects = await prisma.project.updateMany({
    where: { appContext: "free" },
    data: { appContext: "team" },
  });
  console.log(`projects: ${projects.count} updated`);

  const shapes = await prisma.shape.updateMany({
    where: { appContext: "free" },
    data: { appContext: "team" },
  });
  console.log(`shapes: ${shapes.count} updated`);

  const chatGroups = await prisma.chatGroup.updateMany({
    where: { appContext: "free" },
    data: { appContext: "team" },
  });
  console.log(`chatGroups: ${chatGroups.count} updated`);

  console.log("Backfill complete.");
  await prisma.$disconnect();
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
