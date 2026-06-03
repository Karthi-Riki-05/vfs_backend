#!/usr/bin/env node
/**
 * One-time backfill: repair Team subscribers who upgraded under the old
 * (buggy) checkout webhook, which flipped flow.appContext to 'team' WITHOUT
 * setting flow.teamId and never migrated projects/shapes/groups/AI convos —
 * and in many cases never created a Team row at all. The result: their data
 * was visible in neither the personal (free) view nor the team workspace.
 *
 * For every user with an ACTIVE Team subscription this script:
 *   1. Gets or creates their Team row (+ owner TeamMember).
 *   2. Flows    → appContext='team' + teamId=team.id
 *                 (where appContext='free' OR (appContext='team' AND teamId IS NULL))
 *   3. Projects → appContext='team' + teamId=team.id  (where appContext='free')
 *   4. Shapes   → appContext='team'                   (where appContext='free')
 *   5. Groups   → appContext='team'                   (where appContext='free')
 *   6. AI convos→ appContext='team'                   (where appContext='free')
 *   7. user.currentVersion → 'team' (if not already)
 *
 * Idempotent: re-runs only touch rows still in the wrong state; correct users
 * report all-zero counts and are not counted as "fixed".
 *
 * Run inside the backend container:
 *   docker compose exec backend node scripts/backfill-team-migration.js
 *
 * Dry-run (no writes — reports what WOULD change):
 *   DRY_RUN=true docker compose exec backend node scripts/backfill-team-migration.js
 */

"use strict";

const { prisma } = require("../src/lib/prisma");
const logger = require("../src/utils/logger");

const DRY_RUN =
  process.env.DRY_RUN === "true" || process.argv.includes("--dry-run");

async function getOrCreateTeam(user) {
  // Reuse the user's existing team workspace if present.
  let team = await prisma.team.findFirst({
    where: { teamOwnerId: user.id, appContext: "team", deletedAt: null },
  });
  if (team) return { team, created: false };

  // Fall back to ANY non-deleted owned team before creating a new one,
  // so we never spawn a duplicate for users whose team predates app_context.
  team = await prisma.team.findFirst({
    where: { teamOwnerId: user.id, deletedAt: null },
  });
  if (team) return { team, created: false };

  if (DRY_RUN) {
    return { team: { id: "(would-create)" }, created: true };
  }

  team = await prisma.team.create({
    data: {
      name: user.name ? `${user.name}'s Team` : "My Team",
      teamOwnerId: user.id,
      appType: "enterprise",
      appContext: "team",
      status: "active",
      teamMem: user.subscription?.usersCount || 0,
      countMem: 1,
    },
  });

  // Add the owner as the first team member (mirrors team.service.createTeam).
  const existingMember = await prisma.teamMember.findFirst({
    where: { teamId: team.id, userId: user.id },
  });
  if (!existingMember) {
    await prisma.teamMember.create({
      data: {
        teamId: team.id,
        userId: user.id,
        role: "OWNER",
        appType: "enterprise",
      },
    });
  }

  return { team, created: true };
}

async function backfillTeamMigration() {
  const mode = DRY_RUN ? "DRY-RUN (no writes)" : "LIVE";
  console.log(`[Backfill] Starting team migration backfill — mode: ${mode}`);

  // All users with an active Team subscription.
  const users = await prisma.user.findMany({
    where: {
      subscription: {
        status: "active",
        // productType is a Prisma enum — must use `in`, not `startsWith`.
        productType: { in: ["team_monthly", "team_yearly"] },
      },
    },
    include: { subscription: true },
  });

  console.log(`[Backfill] Found ${users.length} active Team subscribers`);

  const totals = {
    usersFixed: 0,
    teamsCreated: 0,
    flows: 0,
    projects: 0,
    shapes: 0,
    shapeGroups: 0,
    conversations: 0,
    versionFixed: 0,
  };

  // Where-clauses shared between dry-run counting and live updates.
  const flowWhere = (uid) => ({
    ownerId: uid,
    deletedAt: null,
    OR: [{ appContext: "free" }, { appContext: "team", teamId: null }],
  });
  const projectWhere = (uid) => ({
    createdBy: uid,
    appContext: "free",
    deletedAt: null,
  });
  const shapeWhere = (uid) => ({
    ownerId: uid,
    appContext: "free",
    deletedAt: null,
  });
  const groupWhere = (uid) => ({
    userId: uid,
    appContext: "free",
    deletedAt: null,
  });
  const convWhere = (uid) => ({ userId: uid, appContext: "free" });

  for (const user of users) {
    const { team, created } = await getOrCreateTeam(user);
    if (created) totals.teamsCreated++;

    const stats = {
      flows: 0,
      projects: 0,
      shapes: 0,
      shapeGroups: 0,
      conversations: 0,
    };

    if (DRY_RUN) {
      stats.flows = await prisma.flow.count({ where: flowWhere(user.id) });
      stats.projects = await prisma.project.count({
        where: projectWhere(user.id),
      });
      stats.shapes = await prisma.shape.count({ where: shapeWhere(user.id) });
      stats.shapeGroups = await prisma.shapeGroup.count({
        where: groupWhere(user.id),
      });
      stats.conversations = await prisma.aiConversation.count({
        where: convWhere(user.id),
      });
    } else {
      // Atomic per-user migration.
      const [flowRes, projRes, shapeRes, groupRes, convRes] =
        await prisma.$transaction([
          prisma.flow.updateMany({
            where: flowWhere(user.id),
            data: { appContext: "team", teamId: team.id },
          }),
          prisma.project.updateMany({
            where: projectWhere(user.id),
            data: { appContext: "team", teamId: team.id },
          }),
          prisma.shape.updateMany({
            where: shapeWhere(user.id),
            data: { appContext: "team" },
          }),
          prisma.shapeGroup.updateMany({
            where: groupWhere(user.id),
            data: { appContext: "team" },
          }),
          prisma.aiConversation.updateMany({
            where: convWhere(user.id),
            data: { appContext: "team" },
          }),
        ]);
      stats.flows = flowRes.count;
      stats.projects = projRes.count;
      stats.shapes = shapeRes.count;
      stats.shapeGroups = groupRes.count;
      stats.conversations = convRes.count;
    }

    // Ensure the user is flipped onto the team tier so the UI requests
    // appContext='team' (otherwise migrated data stays hidden).
    let versionFixed = false;
    if (user.currentVersion !== "team") {
      if (!DRY_RUN) {
        await prisma.user.update({
          where: { id: user.id },
          data: { currentVersion: "team" },
        });
      }
      versionFixed = true;
      totals.versionFixed++;
    }

    totals.flows += stats.flows;
    totals.projects += stats.projects;
    totals.shapes += stats.shapes;
    totals.shapeGroups += stats.shapeGroups;
    totals.conversations += stats.conversations;

    const changed =
      created ||
      versionFixed ||
      stats.flows ||
      stats.projects ||
      stats.shapes ||
      stats.shapeGroups ||
      stats.conversations;

    if (changed) {
      totals.usersFixed++;
      console.log(
        `[Backfill] ${user.email || user.id} → team ${team.id}` +
          `${created ? " (team CREATED)" : ""}` +
          `${versionFixed ? " (currentVersion→team)" : ""}: ` +
          `flows=${stats.flows} projects=${stats.projects} ` +
          `shapes=${stats.shapes} groups=${stats.shapeGroups} ` +
          `convos=${stats.conversations}`,
      );
    } else {
      console.log(
        `[Backfill] ${user.email || user.id} — already correct, skip`,
      );
    }
  }

  console.log("[Backfill] ─────────────────────────────────────────────");
  console.log(
    `[Backfill] ${DRY_RUN ? "WOULD FIX" : "FIXED"} ${totals.usersFixed}/${users.length} users`,
  );
  console.log(
    `[Backfill] teamsCreated=${totals.teamsCreated} ` +
      `currentVersionFixed=${totals.versionFixed} | ` +
      `flows=${totals.flows} projects=${totals.projects} ` +
      `shapes=${totals.shapes} groups=${totals.shapeGroups} ` +
      `convos=${totals.conversations}`,
  );
  if (DRY_RUN) {
    console.log("[Backfill] DRY-RUN complete — no changes were written.");
  } else {
    logger.info(
      `[Backfill] team-migration backfill fixed ${totals.usersFixed} users ` +
        `(${totals.teamsCreated} teams created, ${totals.flows} flows re-linked)`,
    );
  }
}

backfillTeamMigration()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[Backfill] Failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
