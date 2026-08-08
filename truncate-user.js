#!/usr/bin/env node
/**
 * dev_util/truncate-user.js
 *
 * Delete ALL data related to a user while KEEPING the `users` login row.
 * Cancels the user's Stripe subscription(s) + recurring flow add-on, deletes
 * the user's owned team(s) and all team-scoped data, and wipes Account/Session
 * (forced fresh login). Everything except the `users` row is removed.
 *
 * Runs INSIDE the backend container (needs DATABASE access via the `db`
 * service and STRIPE_SECRET_KEY). Copy it in first, then run:
 *
 *   docker compose cp dev_util/truncate-user.js backend:/app/truncate-user.js
 *   docker compose exec backend node truncate-user.js <email> [--yes] [--dry-run]
 *
 * Flags:
 *   --dry-run   Show the non-zero counts only. No deletes, no Stripe cancel.
 *   --yes       Skip the 5s safety pause and proceed (for scripted/agent runs).
 *
 * Safety:
 *   - Refuses to run if NODE_ENV/APP_ENV looks like production unless
 *     ALLOW_PROD_TRUNCATE=1 is set.
 *   - Never deletes the `users` row. No TRUNCATE / DROP.
 *   - All deletes run in ONE transaction — any error rolls back with 0 rows gone.
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  const skipPause = args.includes("--yes");

  if (!email) {
    console.error("Usage: node truncate-user.js <email> [--yes] [--dry-run]");
    process.exit(1);
  }

  // --- production guard ---
  const env = (process.env.APP_ENV || process.env.NODE_ENV || "").toLowerCase();
  if (env.includes("prod") && process.env.ALLOW_PROD_TRUNCATE !== "1") {
    console.error(
      `REFUSING: environment looks like production (${env}). ` +
        `Set ALLOW_PROD_TRUNCATE=1 to override.`,
    );
    process.exit(1);
  }

  // --- Step 1: resolve user ---
  const users = await prisma.$queryRawUnsafe(
    `SELECT id, email, stripe_customer_id FROM users WHERE email = $1`,
    email,
  );
  if (!users.length) {
    console.error(`No user found for ${email}. Nothing to do.`);
    process.exit(1);
  }
  const uid = users[0].id;
  console.log(
    `User: ${email}  id=${uid}  customer=${users[0].stripe_customer_id || "-"}`,
  );

  // owned team ids
  const teams = await prisma.$queryRawUnsafe(
    `SELECT id FROM teams WHERE team_owner_id = $1`,
    uid,
  );
  const tids = teams.map((t) => t.id);
  console.log(`Owned teams: ${tids.length ? tids.join(", ") : "(none)"}`);

  // --- Step 2: non-zero counts ---
  const counts = await countRows(uid, tids);
  const nonZero = Object.entries(counts).filter(([, c]) => c > 0);
  console.log("\nData to be deleted (non-zero):");
  if (!nonZero.length) console.log("  (nothing — user has no related data)");
  nonZero.forEach(([k, c]) => console.log(`  ${k.padEnd(22)} ${c}`));

  if (dryRun) {
    console.log("\n--dry-run: no changes made.");
    await prisma.$disconnect();
    return;
  }

  if (!skipPause) {
    console.log("\nProceeding in 5s (Ctrl+C to abort)...");
    await new Promise((r) => setTimeout(r, 5000));
  }

  // --- Step 3: cancel Stripe subscriptions ---
  await cancelStripe(uid);

  // --- Step 4: delete everything except users row (one transaction) ---
  const tidArr = tids.length ? tids : ["__none__"]; // keep IN(...) valid
  await prisma.$transaction([
    raw(
      `DELETE FROM ai_messages WHERE conversation_id IN (SELECT id FROM ai_conversations WHERE user_id = $1)`,
      uid,
    ),
    raw(`DELETE FROM ai_credit_usages WHERE user_id = $1`, uid),
    raw(`DELETE FROM ai_jobs WHERE user_id = $1`, uid),
    raw(`DELETE FROM ai_conversations WHERE user_id = $1`, uid),
    raw(`DELETE FROM ai_credit_balances WHERE user_id = $1`, uid),
    raw(`DELETE FROM ai_consent WHERE user_id = $1`, uid),
    rawT(
      `DELETE FROM flow_versions    WHERE flow_id IN (SELECT id FROM flows WHERE owner_id = $1 OR team_id = ANY($2))`,
      uid,
      tidArr,
    ),
    rawT(
      `DELETE FROM flow_shares      WHERE flow_id IN (SELECT id FROM flows WHERE owner_id = $1 OR team_id = ANY($2))`,
      uid,
      tidArr,
    ),
    rawT(
      `DELETE FROM flow_publishes   WHERE flow_id IN (SELECT id FROM flows WHERE owner_id = $1 OR team_id = ANY($2))`,
      uid,
      tidArr,
    ),
    rawT(
      `DELETE FROM flow_group_users WHERE flow_id IN (SELECT id FROM flows WHERE owner_id = $1 OR team_id = ANY($2))`,
      uid,
      tidArr,
    ),
    rawT(
      `DELETE FROM flows WHERE owner_id = $1 OR team_id = ANY($2)`,
      uid,
      tidArr,
    ),
    rawT(
      `DELETE FROM shapes WHERE owner_id = $1 OR team_id = ANY($2) OR associated_team_id = ANY($2)`,
      uid,
      tidArr,
    ),
    rawT(
      `DELETE FROM shape_groups WHERE user_id = $1 OR workspace_team_id = ANY($2)`,
      uid,
      tidArr,
    ),
    rawT(
      `DELETE FROM projects WHERE created_by = $1 OR team_id = ANY($2)`,
      uid,
      tidArr,
    ),
    rawT(
      `DELETE FROM issue_list WHERE created_by = $1 OR team_id = ANY($2)`,
      uid,
      tidArr,
    ),
    rawT(
      `DELETE FROM chat_groups WHERE user_id = $1 OR team_id = ANY($2)`,
      uid,
      tidArr,
    ),
    raw(`DELETE FROM transaction_logs WHERE user_id = $1`, uid),
    raw(`DELETE FROM subscription_history WHERE user_id = $1`, uid),
    raw(`DELETE FROM subscription_queue WHERE user_id = $1`, uid),
    raw(`DELETE FROM subscriptions WHERE user_id = $1`, uid),
    rawT(
      `DELETE FROM notifications WHERE user_id = $1 OR team_id = ANY($2)`,
      uid,
      tidArr,
    ),
    raw(`DELETE FROM user_devices WHERE user_id = $1`, uid),
    // team teardown: children before the team row
    rawT(
      `DELETE FROM team_invites WHERE team_id = ANY($2) OR invited_by = $1 OR accepted_by = $1`,
      uid,
      tidArr,
    ),
    rawT(
      `DELETE FROM team_members WHERE user_id = $1 OR team_id = ANY($2)`,
      uid,
      tidArr,
    ),
    raw(`DELETE FROM teams WHERE team_owner_id = $1`, uid),
    // forced fresh login
    raw(`DELETE FROM "Session" WHERE "userId" = $1`, uid),
    raw(`DELETE FROM "Account" WHERE "userId" = $1`, uid),
  ]);

  // --- Step 5: verify ---
  const after = await countRows(uid, tids);
  const leftover = Object.values(after).reduce((a, b) => a + b, 0);
  const stillExists = await prisma.$queryRawUnsafe(
    `SELECT email FROM users WHERE id = $1`,
    uid,
  );
  console.log("\n=== RESULT ===");
  console.log(
    `users row kept: ${stillExists.length ? "YES (" + stillExists[0].email + ")" : "NO — ERROR"}`,
  );
  console.log(`leftover related rows: ${leftover}`);
  console.log(
    leftover === 0 && stillExists.length
      ? "OK — clean."
      : "WARNING — check output above.",
  );

  await prisma.$disconnect();
}

// helper: build a raw SQL delete (single user param)
function raw(sql, uid) {
  return prisma.$executeRawUnsafe(sql, uid);
}
// helper: raw SQL delete with user + team-array params
function rawT(sql, uid, tidArr) {
  return prisma.$executeRawUnsafe(sql, uid, tidArr);
}

async function countRows(uid, tids) {
  const tidArr = tids.length ? tids : ["__none__"];
  const q = (sql, ...p) => prisma.$queryRawUnsafe(sql, ...p);
  const one = async (sql, ...p) => Number((await q(sql, ...p))[0].c);
  return {
    Account: await one(
      `SELECT count(*)::int c FROM "Account" WHERE "userId"=$1`,
      uid,
    ),
    Session: await one(
      `SELECT count(*)::int c FROM "Session" WHERE "userId"=$1`,
      uid,
    ),
    ai_consent: await one(
      `SELECT count(*)::int c FROM ai_consent WHERE user_id=$1`,
      uid,
    ),
    ai_conversations: await one(
      `SELECT count(*)::int c FROM ai_conversations WHERE user_id=$1`,
      uid,
    ),
    ai_credit_balances: await one(
      `SELECT count(*)::int c FROM ai_credit_balances WHERE user_id=$1`,
      uid,
    ),
    ai_credit_usages: await one(
      `SELECT count(*)::int c FROM ai_credit_usages WHERE user_id=$1`,
      uid,
    ),
    ai_jobs: await one(
      `SELECT count(*)::int c FROM ai_jobs WHERE user_id=$1`,
      uid,
    ),
    chat_groups: await one(
      `SELECT count(*)::int c FROM chat_groups WHERE user_id=$1 OR team_id=ANY($2)`,
      uid,
      tidArr,
    ),
    flows: await one(
      `SELECT count(*)::int c FROM flows WHERE owner_id=$1 OR creator_id=$1 OR last_modified_by_id=$1 OR team_id=ANY($2)`,
      uid,
      tidArr,
    ),
    issue_list: await one(
      `SELECT count(*)::int c FROM issue_list WHERE created_by=$1 OR team_id=ANY($2)`,
      uid,
      tidArr,
    ),
    notifications: await one(
      `SELECT count(*)::int c FROM notifications WHERE user_id=$1 OR team_id=ANY($2)`,
      uid,
      tidArr,
    ),
    projects: await one(
      `SELECT count(*)::int c FROM projects WHERE created_by=$1 OR team_id=ANY($2)`,
      uid,
      tidArr,
    ),
    shape_groups: await one(
      `SELECT count(*)::int c FROM shape_groups WHERE user_id=$1 OR workspace_team_id=ANY($2)`,
      uid,
      tidArr,
    ),
    shapes: await one(
      `SELECT count(*)::int c FROM shapes WHERE owner_id=$1 OR team_id=ANY($2) OR associated_team_id=ANY($2)`,
      uid,
      tidArr,
    ),
    subscription_history: await one(
      `SELECT count(*)::int c FROM subscription_history WHERE user_id=$1`,
      uid,
    ),
    subscription_queue: await one(
      `SELECT count(*)::int c FROM subscription_queue WHERE user_id=$1`,
      uid,
    ),
    subscriptions: await one(
      `SELECT count(*)::int c FROM subscriptions WHERE user_id=$1`,
      uid,
    ),
    team_invites: await one(
      `SELECT count(*)::int c FROM team_invites WHERE accepted_by=$1 OR invited_by=$1 OR team_id=ANY($2)`,
      uid,
      tidArr,
    ),
    team_members: await one(
      `SELECT count(*)::int c FROM team_members WHERE user_id=$1 OR team_id=ANY($2)`,
      uid,
      tidArr,
    ),
    teams_owned: await one(
      `SELECT count(*)::int c FROM teams WHERE team_owner_id=$1`,
      uid,
    ),
    transaction_logs: await one(
      `SELECT count(*)::int c FROM transaction_logs WHERE user_id=$1`,
      uid,
    ),
    user_devices: await one(
      `SELECT count(*)::int c FROM user_devices WHERE user_id=$1`,
      uid,
    ),
  };
}

async function cancelStripe(uid) {
  let Stripe;
  try {
    Stripe = require("stripe");
  } catch {
    console.log("Stripe SDK not available — skipping subscription cancel.");
    return;
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log("No STRIPE_SECRET_KEY — skipping subscription cancel.");
    return;
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const subs = await prisma.$queryRawUnsafe(
    `SELECT payment_id FROM subscriptions WHERE user_id=$1 AND payment_id LIKE 'sub_%'`,
    uid,
  );
  const addon = await prisma.$queryRawUnsafe(
    `SELECT flow_addon_stripe_sub_id AS id FROM users WHERE id=$1`,
    uid,
  );
  const ids = new Set(subs.map((s) => s.payment_id));
  if (addon[0] && addon[0].id) ids.add(addon[0].id);

  if (!ids.size) {
    console.log("No Stripe subscriptions to cancel.");
    return;
  }
  for (const id of ids) {
    try {
      const s = await stripe.subscriptions.cancel(id);
      console.log(`Stripe cancelled: ${s.id} -> ${s.status}`);
    } catch (e) {
      console.error(
        `Stripe cancel FAILED for ${id}: ${e.message} (continuing)`,
      );
    }
  }
}

main().catch(async (e) => {
  console.error("FATAL:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
