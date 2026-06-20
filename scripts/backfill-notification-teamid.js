#!/usr/bin/env node
// Backfills Notification.teamId for historical team-scoped notifications that
// predate the workspace-isolation model. Those rows have teamId = NULL but
// carry the real team id inside their metadata JSON (e.g. team_invite,
// team_member_joined), which currently makes them leak into the user's
// PERSONAL workspace instead of the team workspace.
//
// Strategy:
//   • Scan notifications where teamId IS NULL and metadata is present.
//   • Read metadata.teamId; skip if absent.
//   • Verify that team still EXISTS (teamId FK is SetNull — writing a dangling
//     id would violate the constraint), then set the real column.
//
// Idempotent: once a row's teamId is populated it no longer matches the
// `teamId: null` filter, so re-running is a no-op. Batched to stay memory-flat
// on large tables.
//
// SAFETY: read-only SELECTs + per-row UPDATE of a single nullable column. No
// deletes, no schema change. Still: back up first on shared envs —
//   docker compose exec backend node scripts/db-backup.js

const { prisma } = require("../src/lib/prisma");

const BATCH_SIZE = 500;

async function backfill() {
  console.log("Backfilling Notification.teamId from metadata...");

  const teamCache = new Map(); // teamId -> exists(boolean), avoids re-querying
  let cursor = null;
  let scanned = 0;
  let updated = 0;
  let skippedNoMeta = 0;
  let skippedDeadTeam = 0;

  // Keyset pagination over the id column so we never re-scan already-updated
  // rows and never load the whole table at once.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await prisma.notification.findMany({
      where: { teamId: null, metadata: { not: null } },
      select: { id: true, metadata: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    scanned += batch.length;

    for (const n of batch) {
      const meta = n.metadata;
      const metaTeamId =
        meta && typeof meta === "object" && !Array.isArray(meta)
          ? meta.teamId
          : null;

      if (!metaTeamId || typeof metaTeamId !== "string") {
        skippedNoMeta++;
        continue;
      }

      // Resolve (and cache) whether the embedded team still exists.
      let exists = teamCache.get(metaTeamId);
      if (exists === undefined) {
        const team = await prisma.team.findUnique({
          where: { id: metaTeamId },
          select: { id: true },
        });
        exists = !!team;
        teamCache.set(metaTeamId, exists);
      }
      if (!exists) {
        skippedDeadTeam++;
        continue;
      }

      await prisma.notification.update({
        where: { id: n.id },
        data: { teamId: metaTeamId },
      });
      updated++;
    }

    console.log(`  scanned ${scanned}, updated ${updated}...`);
  }

  console.log("Backfill complete.");
  console.log(`  total scanned:            ${scanned}`);
  console.log(`  updated (teamId set):     ${updated}`);
  console.log(`  skipped (no metadata.id): ${skippedNoMeta}`);
  console.log(`  skipped (team deleted):   ${skippedDeadTeam}`);
}

backfill()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
