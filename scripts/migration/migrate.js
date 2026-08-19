"use strict";

/**
 * Laravel MySQL → Node.js PostgreSQL Migration Script
 *
 * Source databases:
 *   master.sql    (12MB)  — valueflowsoft_master: users, subscriptions, teams, chat
 *   enterprise.sql (346MB) — ent_value_chart: team app flows, shapes, issues
 *   individual.sql (24MB)  — ind_value_chart: pro app flows, shapes, issues
 *
 * Run inside backend container:
 *   DRY_RUN=true node scripts/migration/migrate.js   (count only, no writes)
 *   node scripts/migration/migrate.js                (full run)
 *
 * SQL files must be at: /app/scripts/migration/sql/
 *   Place master.sql, enterprise.sql, individual.sql there before running.
 */

const { PrismaClient } = require("@prisma/client");
const { createId } = require("@paralleldrive/cuid2");
const fs = require("fs");
const readline = require("readline");
const path = require("path");

const prisma = new PrismaClient({ log: ["error"] });
const DRY_RUN = process.env.DRY_RUN === "true";
const SQL_DIR = process.env.SQL_DIR || path.join(__dirname, "sql");

const MASTER_SQL = path.join(SQL_DIR, "master.sql");
const ENT_SQL = path.join(SQL_DIR, "enterprise.sql");
const IND_SQL = path.join(SQL_DIR, "individual.sql");

const TODAY = new Date();

// Per-user flow allowances, accumulated from the `flow_limit` tables of the two
// app dumps and applied to the User columns afterwards.
//   enterprise.sql -> Team app -> teamFlowLimit / teamUnlimitedFlows
//   individual.sql -> Pro  app -> proFlowLimit  / proUnlimitedFlows
// The old system stores "unlimited" as the sentinel 1000000000; treat anything
// implausibly large as unlimited rather than testing that exact number, so a
// stray 999999999 is not imported as a literal cap.
const UNLIMITED_SENTINEL = 1_000_000;
// Schema defaults for User.teamFlowLimit / User.proFlowLimit. An imported
// allowance is a FLOOR, never a ceiling: the old free tier was 10 flows, so
// importing it verbatim left 9,921 returning customers more restricted than
// someone signing up today (who gets 50). Only carry a value across when it
// beats the platform default; "unlimited" always wins.
const DEFAULT_TEAM_FLOW_LIMIT = 50;
const DEFAULT_PRO_FLOW_LIMIT = 10;
const userFlowAllowance = new Map(); // userCuid → { team?: n|'unlimited', pro?: … }

// ─── Legacy subscription transition window ───────────────────────────────────
// The old system marks 217 subscriptions (192 users) as `status = 'active'`, but
// only 8 carry a `plan_endat` in the future — the rest were bought in 2022-23
// with NO end date ever recorded, so there is no evidence they are still paid.
// Honouring them forever would hand out permanent free Team access; dropping
// them outright greets 184 former customers as free users on launch day.
//
// Instead they land ACTIVE with a synthetic expiry N days out. The existing
// daily sweep (`subscriptionService.expireLapsedSubscriptions`, 08:00 UTC) then
// flips them to `expired`, downgrades the user and notifies them — so the
// window closes by itself. Set 0 to disable and mark them inactive immediately.
const LEGACY_GRACE_DAYS = Number.parseInt(
  process.env.LEGACY_GRACE_DAYS ?? "30",
  10,
);

// ─── Excluded legacy accounts ────────────────────────────────────────────────
// Internal/synthetic accounts from the old system that must NEVER reach the new
// database: 55 of our own test users (test*, @webronic.com, @test.com,
// mobiletest/livetest/stripetest, prouser/teamuser…) plus 7 Google Play
// pre-launch "Nuage Laboratoire" robots on @cloudtestlabaccounts.com.
//
// The dumps in sql/*.clean.sql already have these stripped; this set is the
// second line of defence for a run pointed at the raw dumps by mistake.
//
// One guard is enough: every child record resolves its owner through
// idMaps.users, and each migrator skips a row whose owner is unmapped — so
// omitting the user here also drops their flows, teams, shapes, chat and subs.
//
// Deliberately NOT excluded: 9 accounts that merely matched the substring
// "test" but look like genuine customers (surnames Testa / Tøstesen /
// Santestevan, "samisfattest69", etc.). Reviewed and kept 2026-08-18.
const EXCLUDED_LEGACY_USER_IDS = new Set([
  12, 14, 15, 19, 27, 33, 44, 46, 49, 50, 52, 53, 67, 71, 75, 82, 84, 86,
  87, 95, 133, 134, 136, 137, 138, 141, 142, 143, 153, 154, 155, 156, 157,
  162, 164, 166, 183, 308, 310, 311, 384, 403, 1006, 1020, 1026, 1036,
  1037, 1049, 1063, 1396, 1709, 1853, 1905, 1918, 2365, 2590, 4992, 7034,
  18371, 18447, 23005, 25399,
]);

// ─── ID Maps (old MySQL int → new CUID) ─────────────────────────────────────
const idMaps = {
  roles: new Map(), // oldInt → newCuid
  users: new Map(), // oldInt → newCuid
  plans: new Map(), // oldInt → newCuid
  planAppTypes: new Map(), // oldPlanInt → 'enterprise'|'individual'|null
  teams: new Map(), // oldInt → newCuid
  teamOwners: new Map(), // newTeamCuid → owner user CUID (TeamMember.workspaceId)
  teamsByOwnerApp: new Map(), // `${legacyOwnerUserId}:${appType}` → team CUID
  reconciledUsers: new Set(), // CUIDs of PRE-EXISTING accounts adopted by email
  entGroups: new Map(), // oldInt → newCuid  (enterprise shape groups)
  indGroups: new Map(), // oldInt → newCuid  (individual shape groups)
  entFlows: new Map(), // oldInt → newCuid
  indFlows: new Map(), // oldInt → newCuid
  flowOwners: new Map(), // `${appType}:${oldFlowInt}` → owner user CUID
  chatGroups: new Map(), // oldInt → newCuid
  chatMessages: new Map(), // oldInt → newCuid
};

const stats = {
  roles: 0,
  users: 0,
  skippedUsers: 0,
  excludedUsers: 0,
  accounts: 0,
  firebaseUsers: 0,
  plans: 0,
  subscriptions: 0,
  teams: 0,
  teamMembers: 0,
  entGroups: 0,
  indGroups: 0,
  entShapes: 0,
  indShapes: 0,
  entFlows: 0,
  indFlows: 0,
  skippedFlows: 0, // total flows with no diagram data, BOTH apps
  entEmptyFlows: 0,
  indEmptyFlows: 0,
  entFlowGroupUsers: 0,
  indFlowGroupUsers: 0,
  entFlowLimits: 0,
  indFlowLimits: 0,
  entFlowPublishes: 0,
  entIssues: 0,
  indIssues: 0,
  transactions: 0,
  chatGroups: 0,
  chatMessages: 0,
  chatGroupUsers: 0,
  chatMsgUsers: 0,
  vsmOptions: 0,
  userInterests: 0,
  feedbackQueries: 0,
  userActions: 0,
  subQueues: 0,
  offers: 0,
  promoCodes: 0,
  permissions: 0,
  aiCreditBalances: 0,
  graceGranted: 0,
  flowAllowances: 0,
  proRestored: 0,
  flowShares: 0,
  teamOwnerGrants: 0,
  recoveredProviderIds: 0,
};

// ─── SQL Helpers ─────────────────────────────────────────────────────────────

/**
 * Extracts rows from a SQL dump for a specific table.
 * Returns { columns: string[], rows: string[][] }
 *
 * TablePlus exports multiple INSERT statements per table (batches of ~500 rows,
 * or 1 row per INSERT for large-blob tables like flows). This function scans
 * ALL matching INSERT blocks in a single file pass.
 */
async function extractRows(sqlFile, tableName) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(sqlFile, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let columns = null;
    let capturing = false;
    let buffer = "";
    const allRows = [];

    const insertRe = new RegExp(
      `^INSERT INTO \`${tableName}\` \\(([^)]+)\\) VALUES`,
      "i",
    );

    function flushBuffer() {
      const clean = buffer.trim().replace(/;$/, "").trim();
      if (clean) {
        try {
          const rows = splitSqlRows(clean).map(parseValueRow);
          allRows.push(...rows);
        } catch (err) {
          // Skip malformed block but continue
          console.error(
            `  [warn] parse error in ${tableName} block: ${err.message}`,
          );
        }
      }
      buffer = "";
    }

    rl.on("line", (line) => {
      if (!capturing) {
        const match = line.match(insertRe);
        if (match) {
          if (!columns) {
            columns = match[1]
              .split(",")
              .map((c) => c.trim().replace(/`/g, ""));
          }
          capturing = true;
          // Data may start after VALUES on the same line
          const valIdx = line.indexOf(") VALUES");
          const rest = line.slice(valIdx + 8).trim();
          buffer = rest;
        }
      } else {
        buffer += "\n" + line;
        if (line.trimEnd().endsWith(";")) {
          // End of this INSERT block — parse it, then look for more
          flushBuffer();
          capturing = false;
        }
      }
    });

    rl.on("close", () => {
      if (capturing && buffer.trim()) flushBuffer(); // trailing block without ;
      resolve({ columns: columns || [], rows: allRows });
    });

    rl.on("error", reject);
  });
}

/**
 * Streaming INSERT block processor — memory-safe for large-blob tables (flows).
 * Calls batchFn(columns, rows[]) for each INSERT block, awaiting before continuing.
 * Uses readline pause/resume so memory never holds more than one block at a time.
 */
async function streamTableBatches(sqlFile, tableName, batchFn) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(sqlFile, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const insertRe = new RegExp(
      `^INSERT INTO \`${tableName}\` \\(([^)]+)\\) VALUES`,
      "i",
    );

    let columns = null;
    let capturing = false;
    let buffer = "";

    function processBlock() {
      const clean = buffer.trim().replace(/;$/, "").trim();
      buffer = "";
      if (!clean) return Promise.resolve();
      let rows;
      try {
        rows = splitSqlRows(clean).map(parseValueRow);
      } catch (err) {
        console.error(
          `  [warn] parse error in ${tableName} block: ${err.message}`,
        );
        return Promise.resolve();
      }
      return batchFn(columns, rows);
    }

    rl.on("line", (line) => {
      if (!capturing) {
        const match = line.match(insertRe);
        if (match) {
          if (!columns) {
            columns = match[1]
              .split(",")
              .map((c) => c.trim().replace(/`/g, ""));
          }
          capturing = true;
          const valIdx = line.indexOf(") VALUES");
          buffer = line.slice(valIdx + 8).trim();
        }
      } else {
        buffer += "\n" + line;
        if (line.trimEnd().endsWith(";")) {
          capturing = false;
          rl.pause();
          processBlock()
            .then(() => rl.resume())
            .catch(reject);
        }
      }
    });

    rl.on("close", () => {
      if (capturing && buffer.trim()) {
        processBlock()
          .then(() => resolve(columns || []))
          .catch(reject);
      } else {
        resolve(columns || []);
      }
    });

    rl.on("error", reject);
  });
}

/**
 * Count rows across ALL INSERT blocks for a table (cheap line scan, no parsing).
 */
async function countRows(sqlFile, tableName) {
  return new Promise((resolve) => {
    const stream = fs.createReadStream(sqlFile, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const insertRe = new RegExp(`INSERT INTO \`${tableName}\``, "i");
    let capturing = false;
    let count = 0;

    rl.on("line", (line) => {
      if (!capturing) {
        if (insertRe.test(line)) capturing = true;
      } else {
        if (line.trimStart().startsWith("(")) count++;
        if (line.trimEnd().endsWith(";")) capturing = false; // block done, keep reading
      }
    });

    rl.on("close", () => resolve(count));
    rl.on("error", () => resolve(0));
  });
}

/**
 * Splits a VALUES string into individual row strings.
 * Handles quoted strings with backslash/double-quote escaping.
 * Input:  "(1,'a','b'),(2,'c','d')"
 * Output: ["(1,'a','b')", "(2,'c','d')"]
 */
function splitSqlRows(valuesStr) {
  const rows = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let start = 0;

  for (let i = 0; i < valuesStr.length; i++) {
    const ch = valuesStr[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === "'" && !inString) {
      inString = true;
      continue;
    }
    if (ch === "'" && inString) {
      inString = false;
      continue;
    }
    if (inString) continue;
    if (ch === "(") depth++;
    if (ch === ")") {
      depth--;
      if (depth === 0) {
        rows.push(valuesStr.slice(start, i + 1).trim());
        // skip comma and whitespace
        while (
          i + 1 < valuesStr.length &&
          (valuesStr[i + 1] === "," ||
            valuesStr[i + 1] === "\n" ||
            valuesStr[i + 1] === "\r" ||
            valuesStr[i + 1] === " ")
        )
          i++;
        start = i + 1;
      }
    }
  }
  return rows.filter((r) => r.length > 0);
}

/**
 * Parses a single SQL row string "(val1, val2, ...)" into an array of values.
 * Handles NULL, numbers, and quoted strings.
 */
// MySQL string-literal escape sequences, as emitted by mysqldump/TablePlus.
const MYSQL_ESCAPES = {
  "0": "\0",
  b: "\b",
  n: "\n",
  r: "\r",
  t: "\t",
  Z: "\x1a",
  "'": "'",
  '"': '"',
  "\\": "\\",
};

function parseValueRow(rowStr) {
  // Strip outer parentheses
  const inner = rowStr.trim().slice(1, -1);
  const values = [];
  let i = 0;
  let inString = false;
  let escape = false;
  let current = "";

  while (i < inner.length) {
    const ch = inner[i];
    if (escape) {
      current += ch;
      escape = false;
      i++;
      continue;
    }
    if (ch === "\\" && inString) {
      // MySQL backslash escape. This used to append the BACKSLASH and then the
      // escaped character, so `\\"` survived as `\\"` instead of `"` — which left
      // 8,108 of 8,110 diagrams holding `<mxGraphModel dx=\\"1406\\"` and made every
      // one of them fail to open. Decode the sequence instead.
      const next = inner[i + 1];
      // `\\%` and `\\_` are the two sequences MySQL leaves intact (they are only
      // special to LIKE); every other escape drops the backslash.
      if (next === "%" || next === "_") {
        current += ch + next;
      } else {
        current += MYSQL_ESCAPES[next] !== undefined ? MYSQL_ESCAPES[next] : next;
      }
      i += 2;
      continue;
    }
    if (ch === "'" && !inString) {
      inString = true;
      i++;
      continue;
    }
    if (ch === "'" && inString) {
      if (inner[i + 1] === "'") {
        current += "'";
        i += 2;
        continue;
      } // SQL escape ''
      inString = false;
      i++;
      continue;
    }
    if (inString) {
      current += ch;
      i++;
      continue;
    }
    if (ch === "," && !inString) {
      values.push(current === "NULL" ? null : current);
      current = "";
      i++;
      // skip space after comma
      while (i < inner.length && inner[i] === " ") i++;
      continue;
    }
    current += ch;
    i++;
  }
  if (current !== "") values.push(current === "NULL" ? null : current);
  return values;
}

// ─── Value Converters ────────────────────────────────────────────────────────

function toInt(v) {
  return v === null ? null : parseInt(v, 10) || null;
}
function toFloat(v) {
  return v === null ? null : parseFloat(v) || 0;
}
function toDate(v) {
  if (!v || v === "0000-00-00 00:00:00") return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function toBool(v) {
  return v === "1" || v === "yes" || v === "true";
}
/**
 * Thumbnails in the old system are FILE PATHS on the old server —
 * `vsm/flow/1356/1767528851_4222.png`, `/uploads/flow/0/…`, bare `*.svg`. Those
 * files are not in the dump and the paths resolve to nothing on the new host, so
 * importing them verbatim put a broken image on 8,100 of 8,110 flow cards.
 *
 * Keep only thumbnails that can actually render on their own — an embedded
 * `data:` URI or an absolute URL. Everything else becomes null, which makes
 * FlowCard fall back to its placeholder icon. They self-heal: the editor
 * captures and stores a fresh thumbnail the first time a flow is saved.
 */
function usableThumbnail(v) {
  const t = nullOrStr(v);
  if (!t) return null;
  return /^(data:|https?:\/\/)/i.test(t) ? t : null;
}

function nullOrStr(v) {
  return v === null || v === "" ? null : String(v);
}
function safeJson(v) {
  if (v === null || v === "") return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}
function mapAppType(v) {
  if (v === "enterprise") return "enterprise";
  if (v === "individual") return "individual";
  return null;
}
function mapAppContext(appType) {
  if (appType === "enterprise") return "team";
  if (appType === "individual") return "pro";
  return "free";
}
function mapClientType(v) {
  if (v === "android") return "android";
  if (v === "ios") return "ios";
  return "web";
}

/**
 * Recover the provider's REAL subject id for a social account.
 *
 * When Apple/Facebook hid the user's address, the old app invented one from the
 * provider's own id: `000726.<32 hex>.1444@valueflowsoft.com` (the Apple `sub`)
 * or `3582109658740190@valueflowsoft.com` (a Facebook id). 14 rows go further and
 * store the bare id with no domain at all.
 *
 * That matters because `remember_token` — the only other candidate — is set on
 * just 4 of 9,445 social rows, so everyone else was getting the legacy ROW NUMBER
 * as their provider id. Combined with an unmatchable email, 761 real customers
 * would sign in with Apple and be handed a brand-new empty account, orphaning
 * 528 flows and 38 paid subscriptions.
 *
 * Only the fabricated addresses are mined: a genuine `12345678@gmail.com` must
 * never be mistaken for a Facebook id, so the domain has to be ours (or absent).
 */
function recoverProviderAccountId(email, rememberToken, legacyId) {
  const at = email ? email.indexOf("@") : -1;
  const local = at === -1 ? email : email.slice(0, at);
  const domain = at === -1 ? "" : email.slice(at + 1).toLowerCase();
  const fabricated = at === -1 || domain === "valueflowsoft.com";

  if (local && fabricated) {
    // Apple `sub`, e.g. 000726.3d338e4323504bcf9e87bb7c7aac08be.1444
    if (/^\d{6}\.[0-9a-f]{32}\.\d{4}$/i.test(local)) return local;
    // Facebook / LinkedIn numeric id
    if (/^\d{8,}$/.test(local)) return local;
  }
  return rememberToken || String(legacyId);
}

function mapLoginProvider(loginType) {
  if (loginType === "google") return "google";
  if (loginType === "facebook") return "facebook";
  if (loginType === "appleId") return "apple";
  if (loginType === "linkedin") return "linkedin";
  return null; // applogin → credentials (no Account row needed)
}
function mapProductType(v) {
  const map = {
    pro_monthly: "pro_monthly",
    team_monthly: "team_monthly",
    pro_yearly: "pro_yearly",
    team_yearly: "team_yearly",
  };
  return map[v] || null;
}
function mapVsmType(v) {
  const map = {
    integer: "integer",
    decimal: "decimal",
    numeric: "numeric",
    text: "text",
  };
  return map[v] || "text";
}

// ─── Step 0: Validate SQL files exist ───────────────────────────────────────

/**
 * A generated Prisma client that predates a schema change fails MID-RUN — the
 * first rehearsal died at migrateTeamMembers on `Unknown argument 'appContext'`
 * after users, plans and subscriptions were already committed. Check the client
 * up front so the fix (`npx prisma generate`) costs nothing instead of leaving a
 * half-populated database behind.
 */
function validateClient() {
  const { Prisma } = require("@prisma/client");
  const required = {
    Flow: ["workspaceId", "creatorId"],
    TeamMember: ["workspaceId", "teamIds", "appContext"],
    Plan: ["userCount", "subPlanId"],
  };
  const missing = [];
  for (const [model, fields] of Object.entries(required)) {
    const m = Prisma.dmmf.datamodel.models.find((x) => x.name === model);
    if (!m) {
      missing.push(`${model} (model absent)`);
      continue;
    }
    const have = new Set(m.fields.map((f) => f.name));
    for (const f of fields) if (!have.has(f)) missing.push(`${model}.${f}`);
  }
  if (missing.length) {
    console.error("\n❌ The generated Prisma client is out of date.");
    console.error(`   Missing: ${missing.join(", ")}`);
    console.error("   Run:  npx prisma generate\n");
    process.exit(1);
  }
  console.log("✅ Prisma client matches the schema");
}

function validateFiles() {
  const missing = [MASTER_SQL, ENT_SQL, IND_SQL].filter(
    (f) => !fs.existsSync(f),
  );
  if (missing.length > 0) {
    console.error("\n❌ Missing SQL files:");
    missing.forEach((f) => console.error("   ", f));
    console.error("\nCopy SQL files to:", SQL_DIR);
    console.error("  mkdir -p", SQL_DIR);
    console.error(
      "  cp old_db/master.sql old_db/enterprise.sql old_db/individual.sql",
      SQL_DIR + "/",
    );
    process.exit(1);
  }
  console.log("✅ SQL files found");
}

// ─── DRY RUN: Count rows only ───────────────────────────────────────────────

async function dryRun() {
  console.log("\n📊 DRY RUN — Counting rows (no DB writes)\n");
  const tables = [
    { file: MASTER_SQL, name: "roles" },
    { file: MASTER_SQL, name: "users" },
    { file: MASTER_SQL, name: "firebase_user" },
    { file: MASTER_SQL, name: "plan" },
    { file: MASTER_SQL, name: "subscription" },
    { file: MASTER_SQL, name: "usersteam" },
    { file: MASTER_SQL, name: "team_members" },
    { file: ENT_SQL, name: "groups", label: "groups (enterprise)" },
    { file: IND_SQL, name: "groups", label: "groups (individual)" },
    { file: ENT_SQL, name: "shapes", label: "shapes (enterprise)" },
    { file: IND_SQL, name: "shapes", label: "shapes (individual)" },
    { file: ENT_SQL, name: "flows", label: "flows (enterprise)" },
    { file: IND_SQL, name: "flows", label: "flows (individual)" },
    {
      file: ENT_SQL,
      name: "flow_group_user",
      label: "flow_group_user (enterprise)",
    },
    {
      file: IND_SQL,
      name: "flow_group_user",
      label: "flow_group_user (individual)",
    },
    { file: ENT_SQL, name: "flow_limit", label: "flow_limit (enterprise)" },
    { file: IND_SQL, name: "flow_limit", label: "flow_limit (individual)" },
    {
      file: ENT_SQL,
      name: "flow_publishes",
      label: "flow_publishes (enterprise)",
    },
    { file: ENT_SQL, name: "tbl_issue_list", label: "issues (enterprise)" },
    { file: IND_SQL, name: "tbl_issue_list", label: "issues (individual)" },
    { file: MASTER_SQL, name: "transaction_log" },
    { file: MASTER_SQL, name: "tbl_chat_group" },
    { file: MASTER_SQL, name: "tbl_chat_msg" },
    { file: MASTER_SQL, name: "tbl_chat_group_user" },
    { file: MASTER_SQL, name: "tbl_chat_msg_user" },
  ];

  for (const t of tables) {
    const count = await countRows(t.file, t.name);
    console.log(`  ${(t.label || t.name).padEnd(35)} ${count} rows`);
  }
  console.log("\n✅ Dry run complete — no data written");
}

// ─── Step 1: Roles ───────────────────────────────────────────────────────────

async function migrateRoles() {
  console.log("\n[1/15] Migrating roles...");
  const { columns, rows } = await extractRows(MASTER_SQL, "roles");
  const ci = (n) => columns.indexOf(n);

  const records = rows.map((r) => ({
    id: createId(),
    legacyId: toInt(r[ci("id")]),
    title: r[ci("title")] || "Viewer",
    createdAt: toDate(r[ci("created_at")]) || new Date(),
    updatedAt: toDate(r[ci("updated_at")]) || new Date(),
  }));

  if (!DRY_RUN) {
    for (const rec of records) {
      // Use the upsert return value — the ACTUAL db id (handles re-runs)
      const dbRole = await prisma.role.upsert({
        where: { legacyId: rec.legacyId },
        update: {},
        create: rec,
      });
      idMaps.roles.set(rec.legacyId, dbRole.id);
    }
  }
  stats.roles = records.length;
  console.log(`   ✓ ${records.length} roles`);
}

// ─── Step 2: Users ──────────────────────────────────────────────────────────

async function migrateUsers() {
  console.log("\n[2/15] Migrating users...");
  const { columns, rows } = await extractRows(MASTER_SQL, "users");
  const ci = (n) => columns.indexOf(n);

  const toMigrate = [];
  const socialAccounts = []; // { userId (new CUID), provider, providerAccountId }

  for (const r of rows) {
    const oldId = toInt(r[ci("id")]);

    // Internal/robot account — drop it and everything that hangs off it.
    if (EXCLUDED_LEGACY_USER_IDS.has(oldId)) {
      stats.excludedUsers++;
      continue;
    }

    const status = r[ci("status")];
    const loginType = r[ci("login_type")];
    const email = nullOrStr(r[ci("email")]);

    const isSocial = loginType && loginType !== "applogin";
    const isDraft = status === "draft";

    // Skip: draft + applogin = bots/incomplete
    if (isDraft && !isSocial) {
      stats.skippedUsers++;
      continue;
    }

    const newId = createId();
    idMaps.users.set(oldId, newId);

    const roleId = idMaps.roles.get(toInt(r[ci("role_id")])) || null;
    const password = isSocial ? null : nullOrStr(r[ci("password")]);

    toMigrate.push({
      id: newId,
      legacyVsId: oldId,
      name: nullOrStr(r[ci("name")]),
      email,
      emailVerified:
        status === "success" ? toDate(r[ci("created_at")]) || new Date() : null,
      password,
      rememberToken: nullOrStr(r[ci("remember_token")]),
      contactNo: nullOrStr(r[ci("contact_no")]),
      photo: nullOrStr(r[ci("photo")]),
      userType:
        r[ci("user_type")] === "admin"
          ? "admin"
          : r[ci("user_type")] === "pro_user"
            ? "pro_user"
            : "free_user",
      userStatus:
        status === "deleted"
          ? "deleted"
          : status === "draft"
            ? "draft"
            : "success",
      clientType: mapClientType(r[ci("client")]),
      welcomeUser: toBool(r[ci("welcome_user")]),
      pFlowRead: toBool(r[ci("p_flow_read")]),
      pFlowModify: toBool(r[ci("p_flow_modify")]),
      pUserRead: toBool(r[ci("p_user_read")]),
      pUserModify: toBool(r[ci("p_user_modify")]),
      pShapeRead: toBool(r[ci("p_shape_read")]),
      pShapeModify: toBool(r[ci("p_shape_modify")]),
      chatEnabled: toBool(r[ci("chat")]),
      isLegacyBcrypt: !isSocial && !!password,
      roleId,
      currentVersion: "free", // Updated after subscriptions
      createdAt: toDate(r[ci("created_at")]) || new Date(),
      updatedAt: toDate(r[ci("updated_at")]) || new Date(),
    });

    if (isSocial) {
      const provider = mapLoginProvider(loginType);
      const providerAccountId = recoverProviderAccountId(
        email,
        nullOrStr(r[ci("remember_token")]),
        oldId,
      );
      if (provider) {
        if (providerAccountId !== String(oldId)) stats.recoveredProviderIds++;
        socialAccounts.push({ userId: newId, provider, providerAccountId });
        stats.accounts++;
      }
    }
  }

  if (!DRY_RUN) {
    // Pre-load existing users to handle email conflicts (existing test users)
    const existingUsers = await prisma.user.findMany({
      select: { id: true, email: true },
    });
    const existingEmailToCuid = new Map(
      existingUsers.map((u) => [u.email, u.id]),
    );

    // Reconcile idMaps: for any email already in DB, use the existing CUID
    // and patch legacyVsId on the existing row instead of inserting a new one
    const reconcileUpdates = [];
    const toInsert = [];
    for (const rec of toMigrate) {
      if (rec.email && existingEmailToCuid.has(rec.email)) {
        const existingCuid = existingEmailToCuid.get(rec.email);
        // Fix ID map to point to existing row
        idMaps.users.set(rec.legacyVsId, existingCuid);
        idMaps.reconciledUsers.add(existingCuid);
        // ONLY the legacy id. Deliberately NOT `isLegacyBcrypt`: this row keeps
        // its OWN (argon2) password — the legacy password is never copied over
        // it — so importing the legacy flag would send the next login down the
        // bcrypt branch to compare against an argon2 hash. That is always false,
        // locking a live account out permanently, and no password reset can undo
        // it. Any staff address present in BOTH systems would hit this.
        reconcileUpdates.push({
          where: { id: existingCuid },
          data: { legacyVsId: rec.legacyVsId },
        });
      } else {
        toInsert.push(rec);
      }
    }

    // Insert new users in batches of 500
    for (let i = 0; i < toInsert.length; i += 500) {
      await prisma.user.createMany({
        data: toInsert.slice(i, i + 500),
        skipDuplicates: true,
      });
    }

    // Patch legacy IDs onto existing users
    for (const upd of reconcileUpdates) {
      await prisma.user.update(upd);
    }
    if (reconcileUpdates.length > 0) {
      console.log(
        `   ℹ ${reconcileUpdates.length} existing users reconciled with legacy IDs`,
      );
    }

    // Create NextAuth Account rows for social users
    for (const acct of socialAccounts) {
      // Use the possibly-reconciled CUID
      const actualUserId =
        idMaps.users.get(
          toMigrate.find((m) => m.id === acct.userId)?.legacyVsId,
        ) || acct.userId;
      await prisma.account.upsert({
        where: {
          provider_providerAccountId: {
            provider: acct.provider,
            providerAccountId: acct.providerAccountId,
          },
        },
        update: {},
        create: {
          id: createId(),
          userId: actualUserId,
          type: "oauth",
          provider: acct.provider,
          providerAccountId: acct.providerAccountId,
        },
      });
    }
  }

  stats.users = toMigrate.length;
  console.log(
    `   ✓ ${toMigrate.length} users migrated, ${stats.skippedUsers} draft+applogin skipped, ${stats.excludedUsers} internal/robot excluded, ${socialAccounts.length} social accounts` +
      (stats.recoveredProviderIds
        ? ` (${stats.recoveredProviderIds} real provider ids recovered)`
        : ""),
  );
}

// ─── Step 3: Firebase Users ─────────────────────────────────────────────────

async function migrateFirebaseUsers() {
  console.log("\n[3/15] Migrating firebase users...");
  const { columns, rows } = await extractRows(MASTER_SQL, "firebase_user");
  const ci = (n) => columns.indexOf(n);

  const records = [];
  for (const r of rows) {
    const userId = idMaps.users.get(toInt(r[ci("user_id")]));
    if (!userId) continue;
    records.push({
      id: createId(),
      userId,
      fcmUsername: nullOrStr(r[ci("fcm_username")]),
      fcmPassword: nullOrStr(r[ci("fcm_password")]),
      fcmUserId: nullOrStr(r[ci("fcm_user_id")]),
      fcmToken: nullOrStr(r[ci("fcm_token")]),
      createdAt: toDate(r[ci("created_at")]) || new Date(),
      updatedAt: toDate(r[ci("updated_at")]),
      deletedAt: toDate(r[ci("deleted_at")]),
    });
  }

  if (!DRY_RUN) {
    for (let i = 0; i < records.length; i += 500) {
      await prisma.firebaseUser.createMany({
        data: records.slice(i, i + 500),
        skipDuplicates: true,
      });
    }
  }
  stats.firebaseUsers = records.length;
  console.log(`   ✓ ${records.length} firebase users`);
}

// ─── Step 4: Plans ──────────────────────────────────────────────────────────

async function migratePlans() {
  console.log("\n[4/15] Migrating plans...");
  const { columns, rows } = await extractRows(MASTER_SQL, "plan");
  const ci = (n) => columns.indexOf(n);

  // The legacy columns are `plan_name` and `cost` — NOT `name`/`price` — and there
  // is no `app_type` column at all. Reading the wrong names made ci() return -1,
  // so r[-1] was undefined and nullOrStr(undefined) produced the STRING
  // "undefined": all five plans upserted onto that one name and the table ended
  // up with a single bogus row at price 0, with every subscription pointing at it.
  // The step still printed "✓ 5 plans" because it counts records built, not rows
  // written, which is why the first migration never surfaced this.

  // `Plan.name` is @unique and the legacy table reuses a name across durations
  // ("Pro" monthly AND yearly), so a bare name still collapses two rows into one.
  // Qualify only the names that are actually reused — that reproduces the
  // "Pro Monthly"/"Team Yearly" convention the seeded plans already use while
  // leaving a one-off name ("Free") alone, so the upsert matches them.
  const nameCounts = new Map();
  for (const r of rows) {
    const n = nullOrStr(r[ci("plan_name")]);
    if (n) nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
  }

  const records = rows.map((r) => {
    const legacyId = toInt(r[ci("id")]);
    const base = nullOrStr(r[ci("plan_name")]) || `Plan_${legacyId}`;
    const duration = r[ci("duration")] === "yearly" ? "yearly" : "monthly";
    const name =
      (nameCounts.get(base) || 0) > 1
        ? `${base} ${duration === "yearly" ? "Yearly" : "Monthly"}`
        : base;
    // Derived, not read: the source has no app_type. The plan family is the only
    // signal, and it agrees with the store ids in sub_plan_id
    // (com.valuecharts.app.pro vs .team).
    const appTypeRaw = /team/i.test(base)
      ? "enterprise"
      : /pro/i.test(base)
        ? "individual"
        : null;
    return {
      id: createId(), // may not be used if plan already exists by name
      legacyId,
      legacySource: "valueflowsoft_master",
      name,
      duration,
      noDuration: nullOrStr(r[ci("no_duration")]),
      price: toFloat(r[ci("cost")]),
      freeTrial: toInt(r[ci("free_trail")]) || 0,
      gracePeriod: toInt(r[ci("grace_period")]) || 0,
      userAccess: toBool(r[ci("user_access")]),
      userCount: toInt(r[ci("user_count")]),
      userCost: r[ci("user_cost")] === null ? null : toFloat(r[ci("user_cost")]),
      status: r[ci("status")] === "inactive" ? "inactive" : "active",
      permissionAccess: safeJson(r[ci("permission_access")]),
      features: safeJson(r[ci("benefits")]),
      colorPick: nullOrStr(r[ci("color_pick")]),
      fontname: nullOrStr(r[ci("fontname")]),
      subPlanId: safeJson(r[ci("sub_plan_id")]),
      subTopId: nullOrStr(r[ci("sub_top_id")]),
      appType: mapAppType(appTypeRaw),
      createdAt: toDate(r[ci("created_at")]) || new Date(),
      updatedAt: toDate(r[ci("updated_at")]),
      deletedAt: toDate(r[ci("deleted_at")]),
    };
  });

  if (!DRY_RUN) {
    for (const rec of records) {
      // Upsert by name (handles pre-existing Stripe setup plans).
      // Update legacyId on match so FK tracing is correct.
      // Use return value so idMaps always has the actual DB id.
      const dbPlan = await prisma.plan.upsert({
        where: { name: rec.name },
        update: { legacyId: rec.legacyId, legacySource: rec.legacySource },
        create: rec,
      });
      idMaps.plans.set(rec.legacyId, dbPlan.id);
      // Recorded so a subscription can derive its tier from the plan that was
      // BOUGHT rather than the app the purchase happened in.
      idMaps.planAppTypes.set(rec.legacyId, rec.appType);
    }
  }
  stats.plans = records.length;
  console.log(
    `   ✓ ${records.length} plans -> ${idMaps.plans.size} distinct rows in DB`,
  );
}

// ─── Step 5: Subscriptions + AiCreditBalances ────────────────────────────────

async function migrateSubscriptions() {
  console.log("\n[5/15] Migrating subscriptions + AI credit balances...");
  const { columns, rows } = await extractRows(MASTER_SQL, "subscription");
  const ci = (n) => columns.indexOf(n);

  // Track which users get which version (for User.currentVersion update)
  const userVersionUpdates = new Map(); // userId (CUID) → 'team'|'pro'

  // Owners of a LIVE enterprise team, read here because migrateTeams runs later.
  // In the old system `usersteam.status='active'` + `team_mem` WAS the team plan;
  // the new app deliberately refuses to infer a plan from team ownership
  // (bug-086 removed exactly that as a security hole), so a legacy owner whose
  // payment row had gone stale lost Teams and Chat entirely. Translating that
  // old-world entitlement into a real subscription row here is the migration's
  // job — it does not re-open the runtime hole, because the app still trusts
  // only the subscription.
  const teamsTable = await extractRows(MASTER_SQL, "usersteam");
  const tci = (n) => teamsTable.columns.indexOf(n);
  const activeTeamSeats = new Map(); // legacy owner user id → seats
  for (const t of teamsTable.rows) {
    if (
      t[tci("status")] !== "inactive" &&
      nullOrStr(t[tci("app_type")]) === "enterprise" &&
      !toDate(t[tci("deleted_at")])
    ) {
      const seats = toInt(t[tci("team_mem")]);
      const owner = toInt(t[tci("team_owner_id")]);
      const prev = activeTeamSeats.get(owner) || 0;
      if (seats && seats > prev) activeTeamSeats.set(owner, seats);
      else if (!activeTeamSeats.has(owner)) activeTeamSeats.set(owner, seats || 0);
    }
  }

  const subscriptions = [];
  const creditBalances = []; // per user, per appContext
  // Legacy Pro lifetime ($1) purchases → userCuid → earliest purchase date.
  // The new app does NOT read subscriptions for Pro: `planResolver.hasProPurchase`
  // requires `hasPro && (proPurchasedAt || isLegacyPro)` on the USER row, and the
  // migration set none of them — so 153 customers who had already bought Pro were
  // being asked to pay $5 again. `isLegacyPro` exists precisely for this case
  // ("covers users migrated in before proPurchasedAt existed").
  const proPurchases = new Map();

  for (const r of rows) {
    const userId = idMaps.users.get(toInt(r[ci("user_id")]));
    if (!userId) continue;

    const planId = idMaps.plans.get(toInt(r[ci("plan_id")]));
    if (!planId) continue;

    const expiresAt = toDate(r[ci("plan_endat")]);
    const appType = nullOrStr(r[ci("app_type")]);
    const paymentId = nullOrStr(r[ci("payment_id")]);
    const isAdminGrant = paymentId === "admin";

    // The source's own status column — previously ignored entirely, which is why
    // a Team purchase with no recorded end date migrated as a free account.
    // The PLAN is authoritative for which app this subscription belongs to.
    // `app_type` on the purchase row records only where the purchase happened —
    // the Pro app could sell a Team plan — so 145 Team Yearly subscribers were
    // being filed as `pro` and 2 Pro Monthly ones as `team`. The row's own
    // `product_type` agrees with the plan, not with `app_type`.
    //   plan enterprise -> Team app -> appContext 'team'
    //   plan individual -> Pro  app -> appContext 'pro'
    const planAppType = idMaps.planAppTypes.get(toInt(r[ci("plan_id")]));
    const effectiveAppType = planAppType || mapAppType(appType);

    // Pro lifetime signature. Two forms exist in the dump, both at price 1:
    //   • payment_id 'individual_intial' — the in-app $1 purchase (161 rows)
    //   • a real Stripe charge id with app_type 'individual' (23 rows)
    // A lifetime purchase never lapses, so the row's status is not a gate.
    const isProLifetime =
      toFloat(r[ci("price")]) === 1 &&
      (paymentId === "individual_intial" || appType === "individual");
    if (isProLifetime) {
      const boughtAt = toDate(r[ci("created_at")]);
      const prev = proPurchases.get(userId);
      if (!prev || (boughtAt && boughtAt < prev)) {
        proPurchases.set(userId, boughtAt || new Date());
      }
      // A lifetime purchase is NOT a subscription, and it must not compete for
      // the single Subscription row (userId is @unique). Every one of these rows
      // carries plan_id 20 ("Team Yearly") regardless of what was actually
      // bought, so leaving them in mislabelled 127 Pro customers as Team and
      // buried the real Team purchase they were hiding. Ownership is recorded
      // on the User via hasPro/proPurchasedAt/isLegacyPro instead.
      continue;
    }

    const sourceActive = nullOrStr(r[ci("status")]) === "active";
    const hasFutureExpiry = expiresAt && expiresAt > TODAY;

    let status;
    let effectiveExpiresAt = expiresAt;
    if (hasFutureExpiry || isAdminGrant) {
      // Provably current, or a deliberate comp — leave the dates alone.
      status = "active";
    } else if (sourceActive && LEGACY_GRACE_DAYS > 0) {
      // Claimed active but unprovable: grant the transition window.
      status = "active";
      effectiveExpiresAt = new Date(
        TODAY.getTime() + LEGACY_GRACE_DAYS * 24 * 60 * 60 * 1000,
      );
      stats.graceGranted++;
    } else {
      status = "inactive";
    }

    // An admin grant keeps whatever date the old system stored, and several are
    // in the PAST — leaving the row 'active' with an expiry of 2021-11-02. The
    // daily sweep (expireLapsedSubscriptions) matches exactly that shape and
    // would revoke the grant on its next run, so an account restored today would
    // silently lose access tomorrow. Give any active-but-already-expired row the
    // same transition window as everything else it cannot date.
    if (
      status === "active" &&
      effectiveExpiresAt &&
      effectiveExpiresAt <= TODAY &&
      LEGACY_GRACE_DAYS > 0
    ) {
      effectiveExpiresAt = new Date(
        TODAY.getTime() + LEGACY_GRACE_DAYS * 24 * 60 * 60 * 1000,
      );
      stats.graceGranted++;
    }

    const appContext =
      effectiveAppType === "enterprise"
        ? "team"
        : effectiveAppType === "individual"
          ? "pro"
          : "free";

    subscriptions.push({
      _legacyUserId: toInt(r[ci("user_id")]), // stripped before insert
      id: createId(),
      legacyId: toInt(r[ci("id")]),
      legacySource: "valueflowsoft_master",
      userId,
      planId,
      paymentId,
      price: toFloat(r[ci("price")]),
      currency: nullOrStr(r[ci("currency")]) || "usd",
      permission: safeJson(r[ci("permission")]),
      isRecurring: toBool(r[ci("is_recurring")]),
      deviceType: mapClientType(r[ci("device_type")]),
      appType: effectiveAppType,
      usersCount: toInt(r[ci("users_count")]),
      flowsCount: nullOrStr(r[ci("flows_count")]),
      subType:
        r[ci("sub_type")] === "flows"
          ? "flows"
          : r[ci("sub_type")] === "users"
            ? "users"
            : null,
      productType: mapProductType(r[ci("product_type")]),
      paidApp: toBool(r[ci("paid_app")]),
      freeTrial: toInt(r[ci("free_trail")]),
      gracePeriod: toInt(r[ci("grace_period")]),
      startedAt: toDate(r[ci("started_at")]),
      status,
      expiresAt: effectiveExpiresAt,
      appContext,
      createdAt: toDate(r[ci("created_at")]) || new Date(),
      updatedAt: new Date(),
      deletedAt: toDate(r[ci("deleted_at")]),
    });

    // Tier comes from the PLAN, not from `app_type`. `app_type` records which
    // app the purchase was made in (the Pro app could sell a Team plan), so
    // trusting it handed `pro` to 145 users who had bought Team Yearly — and
    // `team` to 2 who had bought Pro Monthly. The plan is what they paid for;
    // the row's own `product_type` agrees with it. Falls back to the old signal
    // only when the plan carries no app type (e.g. Free).
    // Tier follows the same plan-derived context, so the user's version, the
    // subscription's appType and its appContext can never disagree.
    if (status === "active") {
      userVersionUpdates.set(userId, appContext === "free" ? "pro" : appContext);
    }
  }

  // Dedup subscriptions: one per userId (Subscription has @unique userId, so a
  // user's purchase history cannot be preserved — 554 source rows collapse to
  // one per user). The previous rule kept whichever row happened to be seen
  // FIRST unless a later one was active, which for a user with 9 purchases kept
  // their oldest 2022 row and discarded the 2023 one. Rank explicitly:
  // active beats inactive, then the later createdAt wins.
  // Rank by SUBSTANCE. Ranking on recency alone kept a bare retry over the real
  // purchase: one user had a genuine $216 Team Yearly (30 seats, product_type
  // set) followed by six identical failed Google Play attempts carrying neither
  // — and a July retry beat the May purchase, so the account showed 5 seats
  // instead of 30. A row that records what was actually bought outranks one
  // that records only that something was attempted.
  const score = (x) =>
    (x.status === "active" ? 8 : 0) +
    (x.productType ? 4 : 0) +
    (x.usersCount ? 2 : 0);
  const better = (a, b) => {
    if (!b) return true;
    const sa = score(a);
    const sb = score(b);
    if (sa !== sb) return sa > sb;
    return (a.createdAt?.getTime() || 0) > (b.createdAt?.getTime() || 0);
  };
  const subsByUser = new Map();
  for (const sub of subscriptions) {
    if (better(sub, subsByUser.get(sub.userId))) {
      subsByUser.set(sub.userId, sub);
    }
  }
  // ─── Live-team owners: grant the same transition window ──────────────────
  // Same rule the owner approved for unprovable subscriptions: real evidence of
  // a paid plan that we cannot date, so honour it for LEGACY_GRACE_DAYS and let
  // the daily expiry sweep close it. Seats come from the team itself when the
  // payment row never recorded them.
  const windowEnd = new Date(
    TODAY.getTime() + LEGACY_GRACE_DAYS * 24 * 60 * 60 * 1000,
  );
  const teamPlanId = idMaps.plans.get(20) || idMaps.plans.values().next().value;
  for (const [legacyOwnerId, seats] of activeTeamSeats) {
    const userId = idMaps.users.get(legacyOwnerId);
    if (!userId || idMaps.reconciledUsers.has(userId)) continue;

    let sub = subsByUser.get(userId);
    if (sub && sub.status === "active" && sub.appContext === "team") {
      // Already a live team plan — only fill in seats if they are missing.
      if (!sub.usersCount && seats) sub.usersCount = seats;
      continue;
    }

    if (!sub) {
      if (!teamPlanId || LEGACY_GRACE_DAYS <= 0) continue;
      sub = {
        _legacyUserId: legacyOwnerId,
        id: createId(),
        legacySource: "valueflowsoft_master",
        userId,
        planId: teamPlanId,
        paymentId: "legacy_team_owner",
        price: 0,
        currency: "usd",
        isRecurring: false,
        appType: "enterprise",
        subType: "users",
        productType: "team_yearly",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      subsByUser.set(userId, sub);
    }

    if (LEGACY_GRACE_DAYS > 0) {
      sub.status = "active";
      sub.expiresAt = windowEnd;
      sub.appContext = "team";
      sub.appType = "enterprise";
      if (!sub.productType) sub.productType = "team_yearly";
      if (!sub.usersCount && seats) sub.usersCount = seats;
      userVersionUpdates.set(userId, "team");
      stats.teamOwnerGrants++;
    }
  }

  const dedupedSubs = Array.from(subsByUser.values()).map(
    ({ _legacyUserId, ...rest }) => rest,
  );

  if (!DRY_RUN) {
    for (const sub of dedupedSubs) {
      await prisma.subscription.upsert({
        where: { userId: sub.userId },
        update: {},
        create: sub,
      });
    }

    // Update User.currentVersion for active subscribers
    for (const [userId, version] of userVersionUpdates) {
      await prisma.user.update({
        where: { id: userId },
        data: { currentVersion: version },
      });
    }

    // Restore Pro lifetime ownership. `isLegacyPro` is set alongside
    // `proPurchasedAt` because aiCredit.service reads the flag to give legacy
    // ($1) Pro the same 50 credits as new ($5) Pro.
    let proRestored = 0;
    for (const [userId, boughtAt] of proPurchases) {
      if (idMaps.reconciledUsers.has(userId)) continue; // never touch a live account
      const data = {
        hasPro: true,
        proPurchasedAt: boughtAt,
        isLegacyPro: true,
      };
      // Pro is their workspace only if a Team plan has not already claimed it —
      // a user can hold both (Team subscription + the $1 Pro purchase).
      if (userVersionUpdates.get(userId) !== "team") {
        data.currentVersion = "pro";
      }
      await prisma.user.update({ where: { id: userId }, data });
      proRestored++;
    }
    stats.proRestored = proRestored;
  }

  // Create AI credit balances for all migrated users
  // We'll do this after users are known — collect user IDs and their versions
  const allUserIds = Array.from(idMaps.users.values());
  for (const userId of allUserIds) {
    const version = userVersionUpdates.get(userId) || "free";
    // Create personal context balance
    creditBalances.push({
      id: createId(),
      userId,
      planCredits: version === "team" ? 300 : version === "pro" ? 200 : 20,
      addonCredits: 0,
      appContext: "free", // personal balance always 'free' context
    });
  }

  if (!DRY_RUN) {
    for (let i = 0; i < creditBalances.length; i += 500) {
      await prisma.aiCreditBalance.createMany({
        data: creditBalances.slice(i, i + 500),
        skipDuplicates: true,
      });
    }
  }

  stats.subscriptions = dedupedSubs.length;
  stats.aiCreditBalances = creditBalances.length;
  console.log(
    `   ✓ ${dedupedSubs.length} subscriptions (${userVersionUpdates.size} active users upgraded)` +
      (stats.graceGranted
        ? `, ${stats.graceGranted} on a ${LEGACY_GRACE_DAYS}-day transition window`
        : "") +
      (stats.proRestored
        ? `, ${stats.proRestored} legacy Pro lifetime purchases restored`
        : "") +
      (stats.teamOwnerGrants
        ? `, ${stats.teamOwnerGrants} live-team owners granted the window`
        : ""),
  );
  console.log(`   ✓ ${creditBalances.length} AI credit balances`);
}

// ─── Step 6: Teams ──────────────────────────────────────────────────────────

async function migrateTeams() {
  console.log("\n[6/15] Migrating teams...");
  const { columns, rows } = await extractRows(MASTER_SQL, "usersteam");
  const ci = (n) => columns.indexOf(n);

  const records = [];
  for (const r of rows) {
    const ownerId = idMaps.users.get(toInt(r[ci("team_owner_id")]));
    if (!ownerId) continue;

    const id = createId();
    idMaps.teams.set(toInt(r[ci("id")]), id);
    idMaps.teamOwners.set(id, ownerId);
    const appType = nullOrStr(r[ci("app_type")]);
    // team_members.team_id is the OWNER'S USER ID, not usersteam.id, so the
    // roster has to be looked up by (owner, app). Verified unique: all 218
    // teams have a distinct (team_owner_id, app_type) pair.
    idMaps.teamsByOwnerApp.set(
      `${toInt(r[ci("team_owner_id")])}:${appType ?? ""}`,
      id,
    );

    records.push({
      id,
      legacyId: toInt(r[ci("id")]),
      teamOwnerId: ownerId,
      teamMem: toInt(r[ci("team_mem")]) || 0,
      countMem: toInt(r[ci("count_mem")]) || 0,
      appType: mapAppType(appType),
      appContext: mapAppContext(appType),
      verifyTeam: nullOrStr(r[ci("verify_team")]),
      status: r[ci("status")] === "inactive" ? "inactive" : "active",
      createdAt: toDate(r[ci("created_at")]) || new Date(),
      updatedAt: toDate(r[ci("updated_at")]),
      deletedAt: toDate(r[ci("deleted_at")]),
    });
  }

  if (!DRY_RUN) {
    for (let i = 0; i < records.length; i += 200) {
      await prisma.team.createMany({
        data: records.slice(i, i + 200),
        skipDuplicates: true,
      });
    }
  }
  stats.teams = records.length;
  console.log(`   ✓ ${records.length} teams`);
}

// ─── Step 7: Team Members ───────────────────────────────────────────────────

async function migrateTeamMembers() {
  console.log("\n[7/15] Migrating team members...");
  const { columns, rows } = await extractRows(MASTER_SQL, "team_members");
  const ci = (n) => columns.indexOf(n);

  const records = [];
  let noMember = 0;
  let noOwner = 0;
  let noTeam = 0;
  for (const r of rows) {
    const userId = idMaps.users.get(toInt(r[ci("user_id")]));
    if (!userId) {
      noMember++;
      continue;
    }

    // `team_members.team_id` does NOT reference usersteam.id — it holds the TEAM
    // OWNER'S USER ID (275 of 295 rows match a team owner; only 42 coincide with
    // a usersteam.id, purely because both id ranges overlap at 2..321). Resolving
    // it through the teams map therefore dropped 288 of 295 memberships and
    // silently attached the surviving 7 to unrelated teams — e.g. user 179 was
    // added to user 1356's workspace. Map it through USERS instead, which is
    // also exactly what TeamMember.workspaceId wants under CHANGE-001.
    const legacyOwnerId = toInt(r[ci("team_id")]);
    const workspaceId = idMaps.users.get(legacyOwnerId);
    if (!workspaceId) {
      noOwner++;
      continue;
    }

    const appType = nullOrStr(r[ci("app_type")]);
    const teamId = idMaps.teamsByOwnerApp.get(
      `${legacyOwnerId}:${appType ?? ""}`,
    );
    if (!teamId) {
      noTeam++;
      continue;
    }

    records.push({
      id: createId(),
      userId,
      workspaceId,
      teamIds: [teamId],
      teamId,
      role: "MEMBER",
      appContext: mapAppContext(appType),
      appType: mapAppType(appType),
      createdAt: toDate(r[ci("created_at")]) || new Date(),
    });
  }

  if (!DRY_RUN) {
    for (let i = 0; i < records.length; i += 500) {
      await prisma.teamMember.createMany({
        data: records.slice(i, i + 500),
        skipDuplicates: true,
      });
    }
  }
  stats.teamMembers = records.length;
  console.log(
    `   ✓ ${records.length} team members` +
      ` (skipped: ${noMember} member not migrated, ${noOwner} owner not migrated, ${noTeam} no matching team)`,
  );
}

// ─── Step 8 & 9: Shape Groups ───────────────────────────────────────────────
// Returns groupOwnerMap: legacy group id → user CUID (for shapes to inherit)

async function migrateShapeGroups(sqlFile, appTypeStr, idMap, statKey) {
  const appContext = mapAppContext(appTypeStr);
  // user column in groups table is `created_by_id` (not user_id)
  const { columns, rows } = await extractRows(sqlFile, "groups");
  const ci = (n) => columns.indexOf(n);

  const records = [];
  const groupOwnerMap = new Map(); // legacy group int id → user CUID

  for (const r of rows) {
    // Both ent and ind groups use `created_by_id`
    const userId = idMaps.users.get(toInt(r[ci("created_by_id")]));
    if (!userId) continue;

    const legacyGroupId = toInt(r[ci("id")]);
    const id = createId();
    idMap.set(legacyGroupId, id);
    groupOwnerMap.set(legacyGroupId, userId);

    records.push({
      id,
      legacyId: legacyGroupId,
      legacySource:
        appTypeStr === "enterprise" ? "ent_value_chart" : "ind_value_chart",
      name: nullOrStr(r[ci("name")]) || "Group",
      userId,
      workspaceId: userId,
      isPredefined: toBool(r[ci("is_predefined")]),
      legacyTeamId: toInt(r[ci("team_id")]) || 0,
      appType: mapAppType(appTypeStr),
      appContext,
      createdAt: toDate(r[ci("created_at")]) || new Date(),
      updatedAt: toDate(r[ci("updated_at")]),
      deletedAt: toDate(r[ci("deleted_at")]),
    });
  }

  if (!DRY_RUN) {
    for (let i = 0; i < records.length; i += 500) {
      await prisma.shapeGroup.createMany({
        data: records.slice(i, i + 500),
        skipDuplicates: true,
      });
    }
  }
  stats[statKey] = records.length;
  console.log(`   ✓ ${records.length} shape groups (${appTypeStr})`);
  return groupOwnerMap; // returned so migrateShapes can inherit user
}

// ─── Step 10 & 11: Shapes ───────────────────────────────────────────────────
// Shapes have no user_id — inherit ownerId from the group's creator

async function migrateShapes(
  sqlFile,
  appTypeStr,
  groupIdMap,
  groupOwnerMap,
  statKey,
) {
  const appContext = mapAppContext(appTypeStr);
  // shape columns: id, name, shape, created_at, updated_at, deleted_at,
  //                group_id, ratio_lock, text_alignment, shape_type
  const { columns, rows } = await extractRows(sqlFile, "shapes");
  const ci = (n) => columns.indexOf(n);

  const records = [];
  for (const r of rows) {
    const legacyGroupId = toInt(r[ci("group_id")]);
    const groupId = groupIdMap.get(legacyGroupId) || null;
    // Inherit owner from group; skip if group owner unknown
    const ownerId = groupOwnerMap.get(legacyGroupId);
    if (!ownerId) continue;

    const shapeTypeRaw = nullOrStr(r[ci("shape_type")]);
    const shapeType = ["img", "stencil", "html", "shape"].includes(shapeTypeRaw)
      ? shapeTypeRaw
      : "img";
    const textAlignRaw = nullOrStr(r[ci("text_alignment")]);

    records.push({
      id: createId(),
      legacyId: toInt(r[ci("id")]),
      legacySource:
        appTypeStr === "enterprise" ? "ent_value_chart" : "ind_value_chart",
      name: nullOrStr(r[ci("name")]) || "Shape",
      type: "stencil",
      content: nullOrStr(r[ci("shape")]),
      textAlignment: ["top", "center", "bottom"].includes(textAlignRaw)
        ? textAlignRaw
        : "bottom",
      ratioLock: toBool(r[ci("ratio_lock")]),
      shapeType,
      groupId,
      ownerId,
      workspaceId: ownerId,
      appType: mapAppType(appTypeStr),
      appContext,
      createdAt: toDate(r[ci("created_at")]) || new Date(),
      updatedAt: toDate(r[ci("updated_at")]),
      deletedAt: toDate(r[ci("deleted_at")]),
    });
  }

  if (!DRY_RUN) {
    for (let i = 0; i < records.length; i += 200) {
      await prisma.shape.createMany({
        data: records.slice(i, i + 200),
        skipDuplicates: true,
      });
    }
  }
  stats[statKey] = records.length;
  console.log(`   ✓ ${records.length} shapes (${appTypeStr})`);
}

// ─── Step 12 & 13: Flows (streaming — one INSERT block at a time to avoid OOM)

async function migrateFlows(sqlFile, appTypeStr, flowIdMap, statKey) {
  const appContext = mapAppContext(appTypeStr);
  const legacySource =
    appTypeStr === "enterprise" ? "ent_value_chart" : "ind_value_chart";
  let totalCount = 0;
  let skipped = 0;

  await streamTableBatches(sqlFile, "flows", async (columns, rows) => {
    const ci = (n) => columns.indexOf(n);
    const records = [];

    for (const r of rows) {
      const userId = idMaps.users.get(toInt(r[ci("created_by_id")]));
      if (!userId) {
        skipped++;
        continue;
      }
      const flowData = nullOrStr(r[ci("flow_data")]);
      if (!flowData) {
        skipped++;
        stats.skippedFlows++;
        if (appTypeStr === "enterprise") stats.entEmptyFlows++;
        else stats.indEmptyFlows++;
        continue;
      }

      const id = createId();
      const legacyFlowId = toInt(r[ci("id")]);
      flowIdMap.set(legacyFlowId, id);
      // Recorded so issues created by an unmigrated user can still land in the
      // right workspace (see migrateIssues).
      idMaps.flowOwners.set(`${appTypeStr}:${legacyFlowId}`, userId);

      records.push({
        id,
        legacyId: toInt(r[ci("id")]),
        legacySource,
        name: nullOrStr(r[ci("flow_name")]) || "Untitled",
        diagramData: flowData,
        thumbnail: usableThumbnail(r[ci("flow_image")]),
        // CHANGE-001 (2026-08-07): `ownerId` was replaced by `workspaceId` (the
        // tenant this flow lives in) and is now required. `creatorId` must also
        // be set — `flow.service.resolveWorkspaceScope` filters on it, and a
        // null would hide every migrated flow from its own owner.
        workspaceId: userId,
        creatorId: userId,
        appType: mapAppType(appTypeStr),
        appContext,
        isPublic: false,
        createdAt: toDate(r[ci("created_at")]) || new Date(),
        updatedAt: toDate(r[ci("updated_at")]) || new Date(),
        deletedAt: toDate(r[ci("deleted_at")]),
      });
    }

    if (!DRY_RUN && records.length > 0) {
      await prisma.flow.createMany({ data: records, skipDuplicates: true });
    }
    totalCount += records.length;
    process.stdout.write(
      `\r   Flows (${appTypeStr}): ${totalCount} inserted, ${skipped} skipped`,
    );
  });

  process.stdout.write("\n");
  stats[statKey] = totalCount;
  console.log(`   ✓ ${totalCount} flows (${appTypeStr}), ${skipped} skipped`);
}

// ─── Step 14: Flow Group Users ──────────────────────────────────────────────

async function migrateFlowGroupUsers(
  sqlFile,
  appTypeStr,
  flowIdMap,
  groupIdMap,
  statKey,
) {
  const { columns, rows } = await extractRows(sqlFile, "flow_group_user");
  const ci = (n) => columns.indexOf(n);

  const records = [];
  // `flow_group_user` IS the old sharing table (`type_flow_share` = yes on every
  // row). It was migrated into FlowGroupUser — a table NOTHING in the app reads;
  // every service resolves sharing through FlowShare, which the migration never
  // wrote. So all 149 shares imported into a dead end and "Shared with me" was
  // empty for everyone. Build the real FlowShare rows here too.
  const shares = [];
  const seenShare = new Set(); // FlowShare is @@unique([flowId, sharedWithId])
  const shareAppContext = appTypeStr === "enterprise" ? "team" : "pro";

  for (const r of rows) {
    const flowId = flowIdMap.get(toInt(r[ci("flow_id")]));
    const userId = idMaps.users.get(toInt(r[ci("user_id")]));
    if (!flowId || !userId) continue;

    const sharedById = idMaps.users.get(toInt(r[ci("created_by_id")]));
    // A share needs both parties, and sharing with yourself is not a share.
    if (
      toBool(r[ci("type_flow_share")]) &&
      sharedById &&
      sharedById !== userId &&
      !toDate(r[ci("deleted_at")])
    ) {
      const key = `${flowId}:${userId}`;
      if (!seenShare.has(key)) {
        seenShare.add(key);
        shares.push({
          id: createId(),
          flowId,
          sharedById,
          sharedWithId: userId,
          // The legacy table records no permission level, only that access was
          // granted. `view` is the safe reading — never silently hand out edit.
          permission: "view",
          appContext: shareAppContext,
          createdAt: toDate(r[ci("created_at")]) || new Date(),
        });
      }
    }

    const groupId = groupIdMap.get(toInt(r[ci("group_id")])) || null;
    records.push({
      id: createId(),
      legacyId: toInt(r[ci("id")]),
      legacySource:
        appTypeStr === "enterprise" ? "ent_value_chart" : "ind_value_chart",
      flowId,
      userId,
      groupId,
      typeFlowShare: toBool(r[ci("type_flow_share")]) ? "yes" : "no",
      typeFlowChat: toBool(r[ci("type_flow_chat")]) ? "yes" : "no",
      teamId: toInt(r[ci("team_id")]) || 0,
      appType: mapAppType(appTypeStr),
      createdAt: toDate(r[ci("created_at")]) || new Date(),
      deletedAt: toDate(r[ci("deleted_at")]),
    });
  }

  if (!DRY_RUN) {
    for (let i = 0; i < records.length; i += 500) {
      await prisma.flowGroupUser.createMany({
        data: records.slice(i, i + 500),
        skipDuplicates: true,
      });
    }
    for (let i = 0; i < shares.length; i += 500) {
      await prisma.flowShare.createMany({
        data: shares.slice(i, i + 500),
        skipDuplicates: true,
      });
    }
  }
  stats[statKey] = records.length;
  stats.flowShares += shares.length;
  console.log(
    `   ✓ ${records.length} flow group users (${appTypeStr}), ${shares.length} flow shares`,
  );
}

// ─── Step 15a: Flow Limits ──────────────────────────────────────────────────

async function migrateFlowLimits(sqlFile, appTypeStr, statKey) {
  const { columns, rows } = await extractRows(sqlFile, "flow_limit");
  const ci = (n) => columns.indexOf(n);

  const records = [];
  for (const r of rows) {
    const userId = idMaps.users.get(toInt(r[ci("user_id")]));
    if (!userId) continue;

    // Remember the allowance so it can be written onto the User row, which is
    // what getPackStatus actually reads for the usage bar. The flow_limits table
    // itself is only consulted by the over-limit picker.
    const totCount = toInt(r[ci("tot_count")]);
    if (totCount !== null) {
      const key = appTypeStr === "enterprise" ? "team" : "pro";
      const slot = userFlowAllowance.get(userId) || {};
      const value = totCount >= UNLIMITED_SENTINEL ? "unlimited" : totCount;
      // A user can have more than one row per app; keep the most generous.
      if (
        slot[key] === undefined ||
        slot[key] === "unlimited" ||
        value === "unlimited" ||
        value > slot[key]
      ) {
        slot[key] = slot[key] === "unlimited" ? "unlimited" : value;
      }
      userFlowAllowance.set(userId, slot);
    }

    records.push({
      id: createId(),
      legacyId: toInt(r[ci("id")]),
      legacySource:
        appTypeStr === "enterprise" ? "ent_value_chart" : "ind_value_chart",
      userId,
      totCount,
      flowUsed: toInt(r[ci("flow_used")]),
      flowIds: nullOrStr(r[ci("flow_ids")]),
      appType: mapAppType(appTypeStr),
      createdAt: toDate(r[ci("created_at")]) || new Date(),
      updatedAt: toDate(r[ci("updated_at")]),
    });
  }

  if (!DRY_RUN) {
    for (let i = 0; i < records.length; i += 500) {
      await prisma.flowLimit.createMany({
        data: records.slice(i, i + 500),
        skipDuplicates: true,
      });
    }
  }
  stats[statKey] = records.length;
  console.log(`   ✓ ${records.length} flow limits (${appTypeStr})`);
}

// ─── Step 15b: Flow Publishes (enterprise only) ─────────────────────────────

async function migrateFlowPublishes() {
  console.log("\n[15b] Migrating flow publishes...");
  const { columns, rows } = await extractRows(ENT_SQL, "flow_publishes");
  const ci = (n) => columns.indexOf(n);

  const records = [];
  for (const r of rows) {
    const flowId = idMaps.entFlows.get(toInt(r[ci("flow_id")]));
    const userId = idMaps.users.get(toInt(r[ci("user_id")]));
    if (!flowId || !userId) continue;

    records.push({
      id: createId(),
      legacyId: toInt(r[ci("id")]),
      legacySource: "ent_value_chart",
      flowId,
      userId,
      flowData: nullOrStr(r[ci("flow_data")]),
      appType: "enterprise",
      createdAt: toDate(r[ci("created_at")]),
      updatedAt: toDate(r[ci("updated_at")]),
    });
  }

  if (!DRY_RUN) {
    await prisma.flowPublish.createMany({
      data: records,
      skipDuplicates: true,
    });
  }
  stats.entFlowPublishes = records.length;
  console.log(`   ✓ ${records.length} flow publishes`);
}

// ─── Step 15c: Issues ───────────────────────────────────────────────────────

async function migrateIssues(sqlFile, appTypeStr, statKey) {
  const appContext = mapAppContext(appTypeStr);
  const { columns, rows } = await extractRows(sqlFile, "tbl_issue_list");
  const ci = (n) => columns.indexOf(n);

  const records = [];
  let orphaned = 0;
  for (const r of rows) {
    const userId = idMaps.users.get(toInt(r[ci("created_by")]));
    const legacyFlowId = toInt(r[ci("flow_id")]);
    const flowOwner = idMaps.flowOwners.get(`${appTypeStr}:${legacyFlowId}`);

    // Every issue in the source is attached to a flow (verified: 0 rows with
    // flow_id 0 or NULL), so an issue whose flow did not migrate — because the
    // flow's creator was skipped, or the flow had NULL flow_data — is a dangling
    // reference to a diagram that no longer exists. Importing it produced 110
    // dead rows, 76 of which had a creator and so would surface in the UI against
    // a phantom flow. Skipped, matching how every other child table here drops a
    // row whose parent is unmapped.
    if (!flowOwner) {
      orphaned++;
      continue;
    }

    records.push({
      id: createId(),
      legacyId: toInt(r[ci("id")]),
      legacySource:
        appTypeStr === "enterprise" ? "ent_value_chart" : "ind_value_chart",
      title: nullOrStr(r[ci("title")]) || "",
      flowId: toInt(r[ci("flow_id")]) || 0,
      flowItemId: nullOrStr(r[ci("flow_item_id")]) || "",
      companyId: toInt(r[ci("company_id")]),
      isChecked: toBool(r[ci("is_checked")]),
      createdById: userId || null,
      // Fall back to the OWNER OF THE FLOW the issue belongs to. 34 issues were
      // raised by users who are not migrated (skipped drafts); with a null
      // workspace they exist but are invisible to every workspace-scoped query.
      // Attribution (`createdById`) stays honest and stays null.
      workspaceId: userId || flowOwner,
      appType: mapAppType(appTypeStr),
      appContext,
      createdAt: toDate(r[ci("created_at")]) || new Date(),
    });
  }

  if (!DRY_RUN) {
    for (let i = 0; i < records.length; i += 500) {
      await prisma.issueItem.createMany({
        data: records.slice(i, i + 500),
        skipDuplicates: true,
      });
    }
  }
  stats[statKey] = records.length;
  console.log(
    `   ✓ ${records.length} issues (${appTypeStr})` +
      (orphaned ? `, ${orphaned} skipped — parent flow not migrated` : ""),
  );
}

// ─── Step 15d: Transactions ─────────────────────────────────────────────────

async function migrateTransactions() {
  console.log("\n[15d] Migrating transaction logs...");
  const { columns, rows } = await extractRows(MASTER_SQL, "transaction_log");
  const ci = (n) => columns.indexOf(n);

  const records = [];
  const seenTxnIds = new Set();
  for (const r of rows) {
    const userId = idMaps.users.get(toInt(r[ci("user_id")])) || null;
    const txnId = nullOrStr(r[ci("txn_id")]);

    if (txnId && seenTxnIds.has(txnId)) continue;
    if (txnId) seenTxnIds.add(txnId);

    records.push({
      id: createId(),
      legacyId: toInt(r[ci("id")]),
      legacySource: "valueflowsoft_master",
      userId,
      chargeId: nullOrStr(r[ci("charge_id")]),
      txnId,
      amountCharged: toInt(r[ci("amount_charged")]),
      paymentMethod: nullOrStr(r[ci("payment_method")]),
      holderName: nullOrStr(r[ci("holder_name")]),
      currency: nullOrStr(r[ci("currency")]),
      status: nullOrStr(r[ci("status")]),
      createdAt: toDate(r[ci("created_at")]) || new Date(),
    });
  }

  if (!DRY_RUN) {
    for (let i = 0; i < records.length; i += 500) {
      await prisma.transactionLog.createMany({
        data: records.slice(i, i + 500),
        skipDuplicates: true,
      });
    }
  }
  stats.transactions = records.length;
  console.log(`   ✓ ${records.length} transactions`);
}

// ─── Step 15e: Chat ─────────────────────────────────────────────────────────

async function migrateChat() {
  console.log("\n[15e] Migrating chat (master DB only)...");

  // Chat groups
  {
    const { columns, rows } = await extractRows(MASTER_SQL, "tbl_chat_group");
    const ci = (n) => columns.indexOf(n);
    const records = [];
    for (const r of rows) {
      const userId = idMaps.users.get(toInt(r[ci("user_id")]));
      if (!userId) continue;

      const id = createId();
      idMaps.chatGroups.set(toInt(r[ci("id")]), id);
      const teamId = idMaps.teams.get(toInt(r[ci("team_id")])) || null;

      records.push({
        id,
        legacyId: toInt(r[ci("id")]),
        legacySource: "valueflowsoft_master",
        title: nullOrStr(r[ci("title")]) || "Chat",
        picture: nullOrStr(r[ci("picture")]),
        userId,
        teamId,
        flowId: toInt(r[ci("flow_id")]) || 0,
        flowItemId: nullOrStr(r[ci("flow_item_id")]) || "",
        appContext: "free",
        createdAt: toDate(r[ci("created_at")]),
        updatedAt: toDate(r[ci("updated_at")]),
        deletedAt: toDate(r[ci("deleted_at")]),
      });
    }
    if (!DRY_RUN)
      await prisma.chatGroup.createMany({
        data: records,
        skipDuplicates: true,
      });
    stats.chatGroups = records.length;
    console.log(`   ✓ ${records.length} chat groups`);
  }

  // Chat messages
  {
    const { columns, rows } = await extractRows(MASTER_SQL, "tbl_chat_msg");
    const ci = (n) => columns.indexOf(n);
    const msgTypeMap = {
      text: "text",
      image: "image",
      audio: "audio",
      video: "video",
      docs: "docs",
      others: "others",
    };
    const records = [];
    for (const r of rows) {
      const userId = idMaps.users.get(toInt(r[ci("user_id")]));
      const groupId = idMaps.chatGroups.get(toInt(r[ci("group_id")]));
      if (!userId || !groupId) continue;

      const id = createId();
      idMaps.chatMessages.set(toInt(r[ci("id")]), id);
      const msgType = nullOrStr(r[ci("type")]);

      records.push({
        id,
        legacyId: toInt(r[ci("id")]),
        legacySource: "valueflowsoft_master",
        message: nullOrStr(r[ci("message")]) || "",
        groupId,
        type: msgTypeMap[msgType] || "text",
        userId,
        teamId: toInt(r[ci("team_id")]),
        attachPath: nullOrStr(r[ci("attach_path")]),
        createdAt: toDate(r[ci("created_at")]) || new Date(),
        deletedAt: toDate(r[ci("deleted_at")]),
      });
    }
    if (!DRY_RUN) {
      for (let i = 0; i < records.length; i += 200) {
        await prisma.chatMessage.createMany({
          data: records.slice(i, i + 200),
          skipDuplicates: true,
        });
      }
    }
    stats.chatMessages = records.length;
    console.log(`   ✓ ${records.length} chat messages`);
  }

  // Chat group users
  {
    const { columns, rows } = await extractRows(
      MASTER_SQL,
      "tbl_chat_group_user",
    );
    const ci = (n) => columns.indexOf(n);
    const records = [];
    for (const r of rows) {
      const userId = idMaps.users.get(toInt(r[ci("user_id")]));
      const groupId = idMaps.chatGroups.get(toInt(r[ci("group_id")]));
      if (!userId || !groupId) continue;
      records.push({
        id: createId(),
        userId,
        groupId,
        chatClear: toDate(r[ci("chat_clear")]),
        createdAt: toDate(r[ci("created_at")]),
      });
    }
    if (!DRY_RUN)
      await prisma.chatGroupUser.createMany({
        data: records,
        skipDuplicates: true,
      });
    stats.chatGroupUsers = records.length;
    console.log(`   ✓ ${records.length} chat group users`);
  }

  // Chat message users (read receipts)
  {
    const { columns, rows } = await extractRows(
      MASTER_SQL,
      "tbl_chat_msg_user",
    );
    const ci = (n) => columns.indexOf(n);
    const records = [];
    for (const r of rows) {
      const msgId = idMaps.chatMessages.get(toInt(r[ci("msg_id")]));
      const senderId = idMaps.users.get(toInt(r[ci("sender_id")]));
      const receiverId = idMaps.users.get(toInt(r[ci("receiver_id")]));
      const groupId = idMaps.chatGroups.get(toInt(r[ci("group_id")]));
      if (!msgId || !senderId || !receiverId || !groupId) continue;
      records.push({
        id: createId(),
        msgId,
        senderId,
        receiverId,
        isRead: toBool(r[ci("is_read")]),
        groupId,
        teamId: toInt(r[ci("team_id")]),
        createdAt: toDate(r[ci("created_at")]),
      });
    }
    if (!DRY_RUN) {
      for (let i = 0; i < records.length; i += 500) {
        await prisma.chatMessageUser.createMany({
          data: records.slice(i, i + 500),
          skipDuplicates: true,
        });
      }
    }
    stats.chatMsgUsers = records.length;
    console.log(`   ✓ ${records.length} chat message users`);
  }
}

// ─── Step 15f: Small tables ─────────────────────────────────────────────────

async function migrateSmallTables() {
  console.log("\n[15f] Migrating small tables...");

  // VsmOptions
  {
    const { columns, rows } = await extractRows(MASTER_SQL, "vsm_options");
    const ci = (n) => columns.indexOf(n);
    const records = [];
    for (const r of rows) {
      const userId = idMaps.users.get(toInt(r[ci("created_by_id")]));
      if (!userId) continue;
      records.push({
        id: createId(),
        legacyId: toInt(r[ci("id")]),
        legacySource: "valueflowsoft_master",
        title: nullOrStr(r[ci("title")]) || "",
        type: mapVsmType(r[ci("type")]),
        companyId: toInt(r[ci("company_id")]),
        teamId: toInt(r[ci("team_id")]),
        createdById: userId,
        createdAt: toDate(r[ci("created_at")]) || new Date(),
      });
    }
    if (!DRY_RUN)
      await prisma.vsmOption.createMany({
        data: records,
        skipDuplicates: true,
      });
    stats.vsmOptions = records.length;
    console.log(`   ✓ ${records.length} VSM options`);
  }

  // User interests
  {
    const { columns, rows } = await extractRows(MASTER_SQL, "user_interests");
    const ci = (n) => columns.indexOf(n);
    const records = [];
    for (const r of rows) {
      const userId = idMaps.users.get(toInt(r[ci("user_id")]));
      if (!userId) continue;
      records.push({
        id: createId(),
        userId,
        userOccupation: nullOrStr(r[ci("user_occupation")]),
        userInterest: safeJson(r[ci("user_interest")]),
        legacySource: "valueflowsoft_master",
        createdAt: toDate(r[ci("created_at")]),
        updatedAt: toDate(r[ci("updated_at")]),
      });
    }
    if (!DRY_RUN)
      await prisma.userInterest.createMany({
        data: records,
        skipDuplicates: true,
      });
    stats.userInterests = records.length;
    console.log(`   ✓ ${records.length} user interests`);
  }

  // Feedback queries
  {
    const { columns, rows } = await extractRows(
      MASTER_SQL,
      "tbl_feedback_query",
    );
    const ci = (n) => columns.indexOf(n);
    const records = [];
    for (const r of rows) {
      const userId = idMaps.users.get(toInt(r[ci("user_id")]));
      if (!userId) continue;
      const msgType = r[ci("msg_type")] === "query" ? "query" : "feedback";
      records.push({
        id: createId(),
        message: nullOrStr(r[ci("message")]),
        userId,
        msgType,
        appType: mapAppType(r[ci("app_type")]) || "enterprise",
        appDevice: mapClientType(r[ci("app_device")]),
        appContext: "free",
        createdAt: toDate(r[ci("created_at")]) || new Date(),
      });
    }
    if (!DRY_RUN) {
      for (let i = 0; i < records.length; i += 500) {
        await prisma.feedbackQuery.createMany({
          data: records.slice(i, i + 500),
          skipDuplicates: true,
        });
      }
    }
    stats.feedbackQueries = records.length;
    console.log(`   ✓ ${records.length} feedback queries`);
  }

  // User actions (audit log)
  {
    const { columns, rows } = await extractRows(MASTER_SQL, "user_actions");
    const ci = (n) => columns.indexOf(n);
    const records = [];
    for (const r of rows) {
      const userId = idMaps.users.get(toInt(r[ci("user_id")])) || null;
      records.push({
        id: createId(),
        action: nullOrStr(r[ci("action")]) || "",
        actionModel: nullOrStr(r[ci("action_model")]),
        actionId: toInt(r[ci("action_id")]),
        userId,
        appContext: "free",
        createdAt: toDate(r[ci("created_at")]),
      });
    }
    if (!DRY_RUN) {
      for (let i = 0; i < records.length; i += 500) {
        await prisma.userAction.createMany({
          data: records.slice(i, i + 500),
          skipDuplicates: true,
        });
      }
    }
    stats.userActions = records.length;
    console.log(`   ✓ ${records.length} user actions`);
  }

  // Offers
  {
    const { columns, rows } = await extractRows(MASTER_SQL, "offers");
    const ci = (n) => columns.indexOf(n);
    const records = rows.map((r) => ({
      id: createId(),
      offName: nullOrStr(r[ci("off_name")]),
      type: nullOrStr(r[ci("type")]),
      planOffer: nullOrStr(r[ci("plan_offer")]) || "",
      userOffer: nullOrStr(r[ci("user_offer")]),
      startDate: toDate(r[ci("start_date")]),
      expiredDate: toDate(r[ci("expired_date")]),
      status: r[ci("status")] === "inactive" ? "inactive" : "active",
      afterOfferId: toInt(r[ci("after_offer_id")]),
      createdAt: toDate(r[ci("created_at")]) || new Date(),
    }));
    if (!DRY_RUN)
      await prisma.offer.createMany({ data: records, skipDuplicates: true });
    stats.offers = records.length;
    console.log(`   ✓ ${records.length} offers`);
  }

  // PromoCode
  {
    const { columns, rows } = await extractRows(MASTER_SQL, "promocodes");
    const ci = (n) => columns.indexOf(n);
    const records = rows.map((r) => ({
      id: createId(),
      promoCode: nullOrStr(r[ci("promo_code")]),
      validUpto: toDate(r[ci("valid_upto")]),
      discountPercentage: toFloat(r[ci("discount_percentage")]),
      legacySource: "valueflowsoft_master",
      createdAt: toDate(r[ci("created_at")]),
    }));
    if (!DRY_RUN)
      await prisma.promoCode.createMany({
        data: records,
        skipDuplicates: true,
      });
    stats.promoCodes = records.length;
    console.log(`   ✓ ${records.length} promo codes`);
  }

  // Permissions
  {
    const { columns, rows } = await extractRows(MASTER_SQL, "permissions");
    const ci = (n) => columns.indexOf(n);
    const records = rows.map((r) => ({
      id: createId(),
      name: nullOrStr(r[ci("name")]),
      createdAt: toDate(r[ci("created_at")]),
      updatedAt: toDate(r[ci("updated_at")]),
      deletedAt: toDate(r[ci("deleted_at")]),
    }));
    if (!DRY_RUN)
      await prisma.permission.createMany({
        data: records,
        skipDuplicates: true,
      });
    stats.permissions = records.length;
    console.log(`   ✓ ${records.length} permissions`);
  }
}


// ─── Apply flow allowances to the User row ──────────────────────────────────
/**
 * `getPackStatus` (flow.service) draws the usage bar from User.teamFlowLimit /
 * teamUnlimitedFlows / proFlowLimit / proUnlimitedFlows — NOT from the
 * flow_limits table. Those four columns were never written, so every migrated
 * user fell back to the schema defaults (team 50, pro 10) and a legitimately
 * unlimited account showed "122 / 50" with a red over-limit bar.
 *
 * Pre-existing accounts adopted by email are skipped: their current limits are
 * live billing state and must not be overwritten by 2022 numbers.
 */
async function applyFlowAllowances() {
  console.log("\n[15g] Applying flow allowances to users...");
  let team = 0;
  let pro = 0;
  let unlimited = 0;
  let floored = 0;
  let skipped = 0;

  for (const [userId, slot] of userFlowAllowance) {
    if (idMaps.reconciledUsers.has(userId)) {
      skipped++;
      continue;
    }
    const data = {};
    if (slot.team !== undefined) {
      if (slot.team === "unlimited") {
        data.teamUnlimitedFlows = true;
        unlimited++;
        team++;
      } else if (slot.team > DEFAULT_TEAM_FLOW_LIMIT) {
        data.teamFlowLimit = slot.team;
        team++;
      } else {
        floored++; // keep the platform default — it is more generous
      }
    }
    if (slot.pro !== undefined) {
      if (slot.pro === "unlimited") {
        data.proUnlimitedFlows = true;
        unlimited++;
        pro++;
      } else if (slot.pro > DEFAULT_PRO_FLOW_LIMIT) {
        data.proFlowLimit = slot.pro;
        pro++;
      } else {
        floored++;
      }
    }
    if (Object.keys(data).length === 0) continue;
    if (!DRY_RUN) {
      await prisma.user.update({ where: { id: userId }, data });
    }
  }
  stats.flowAllowances = team + pro;
  console.log(
    `   \u2713 ${team} team + ${pro} pro allowances applied (${unlimited} unlimited)` +
      (floored
        ? `, ${floored} kept the platform default (legacy value was lower)`
        : "") +
      (skipped ? `, ${skipped} pre-existing accounts left untouched` : ""),
  );
}

// ─── Verification ────────────────────────────────────────────────────────────

async function verifyMigration() {
  console.log("\n📋 Verification — DB counts:\n");
  if (DRY_RUN) {
    console.log("   (dry run — skipping DB queries)\n");
    return;
  }

  const counts = await Promise.all([
    prisma.user.count(),
    prisma.role.count(),
    prisma.firebaseUser.count(),
    prisma.plan.count(),
    prisma.subscription.count(),
    prisma.team.count(),
    prisma.teamMember.count(),
    prisma.shapeGroup.count(),
    prisma.shape.count(),
    prisma.flow.count(),
    prisma.flowGroupUser.count(),
    prisma.flowLimit.count(),
    prisma.chatGroup.count(),
    prisma.chatMessage.count(),
    prisma.issueItem.count(),
    prisma.transactionLog.count(),
    prisma.aiCreditBalance.count(),
  ]);

  const labels = [
    "users",
    "roles",
    "firebase_users",
    "plans",
    "subscriptions",
    "teams",
    "team_members",
    "shape_groups",
    "shapes",
    "flows",
    "flow_group_users",
    "flow_limits",
    "chat_groups",
    "chat_messages",
    "issues",
    "transaction_logs",
    "ai_credit_balances",
  ];
  labels.forEach((l, i) => console.log(`  ${l.padEnd(30)} ${counts[i]}`));

  // Credit balance breakdown
  const creditStats = await prisma.aiCreditBalance.groupBy({
    by: ["planCredits"],
    _count: { id: true },
    orderBy: { planCredits: "desc" },
  });
  console.log("\n  AI Credit Balance breakdown:");
  creditStats.forEach((s) =>
    console.log(`    ${s.planCredits} credits: ${s._count.id} users`),
  );
}

// ─── Report ──────────────────────────────────────────────────────────────────

async function generateReport() {
  const report = `# Migration Report
Generated: ${new Date().toISOString()}
Mode: ${DRY_RUN ? "DRY RUN (no DB writes)" : "FULL MIGRATION"}

## Results

| Table | Migrated |
|-------|---------|
| Roles | ${stats.roles} |
| Users | ${stats.users} (${stats.skippedUsers} draft+applogin skipped) |
| Social accounts | ${stats.accounts} |
| Firebase users | ${stats.firebaseUsers} |
| Plans | ${stats.plans} |
| Subscriptions | ${stats.subscriptions} |
| AI credit balances | ${stats.aiCreditBalances} |
| Teams | ${stats.teams} |
| Team members | ${stats.teamMembers} |
| Shape groups (enterprise) | ${stats.entGroups} |
| Shape groups (individual) | ${stats.indGroups} |
| Shapes (enterprise) | ${stats.entShapes} |
| Shapes (individual) | ${stats.indShapes} |
| Flows (enterprise) | ${stats.entFlows} (${stats.entEmptyFlows} empty flow_data skipped) |
| Flows (individual) | ${stats.indFlows} (${stats.indEmptyFlows} empty flow_data skipped) |
| Flow group users (enterprise) | ${stats.entFlowGroupUsers} |
| Flow group users (individual) | ${stats.indFlowGroupUsers} |
| Flow limits (enterprise) | ${stats.entFlowLimits} |
| Flow limits (individual) | ${stats.indFlowLimits} |
| Flow publishes | ${stats.entFlowPublishes} |
| Issues (enterprise) | ${stats.entIssues} |
| Issues (individual) | ${stats.indIssues} |
| Transaction logs | ${stats.transactions} |
| Chat groups | ${stats.chatGroups} |
| Chat messages | ${stats.chatMessages} |
| Chat group users | ${stats.chatGroupUsers} |
| Chat message users | ${stats.chatMsgUsers} |
| VSM options | ${stats.vsmOptions} |
| User interests | ${stats.userInterests} |
| Feedback queries | ${stats.feedbackQueries} |
| User actions | ${stats.userActions} |
| Offers | ${stats.offers} |
| Promo codes | ${stats.promoCodes} |
| Permissions | ${stats.permissions} |
`;

  const reportPath = path.join(__dirname, "migration-report.md");
  fs.writeFileSync(reportPath, report);
  console.log(`\n📄 Report saved to ${reportPath}`);
  return report;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("ValueChart Migration: MySQL → PostgreSQL");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no DB writes)" : "FULL MIGRATION"}`);
  console.log(`SQL dir: ${SQL_DIR}`);
  console.log("=".repeat(60));

  validateFiles();
  validateClient();

  if (DRY_RUN) {
    await dryRun();
    return;
  }

  const start = Date.now();

  // Run migration steps in order
  await migrateRoles();
  await migrateUsers();
  await migrateFirebaseUsers();
  await migratePlans();
  await migrateSubscriptions();
  await migrateTeams();
  await migrateTeamMembers();

  console.log("\n[8/15] Migrating enterprise shape groups...");
  const entGroupOwnerMap = await migrateShapeGroups(
    ENT_SQL,
    "enterprise",
    idMaps.entGroups,
    "entGroups",
  );
  console.log("\n[9/15] Migrating individual shape groups...");
  const indGroupOwnerMap = await migrateShapeGroups(
    IND_SQL,
    "individual",
    idMaps.indGroups,
    "indGroups",
  );

  console.log("\n[10/15] Migrating enterprise shapes...");
  await migrateShapes(
    ENT_SQL,
    "enterprise",
    idMaps.entGroups,
    entGroupOwnerMap,
    "entShapes",
  );
  console.log("\n[11/15] Migrating individual shapes...");
  await migrateShapes(
    IND_SQL,
    "individual",
    idMaps.indGroups,
    indGroupOwnerMap,
    "indShapes",
  );

  console.log("\n[12/15] Migrating enterprise flows...");
  await migrateFlows(ENT_SQL, "enterprise", idMaps.entFlows, "entFlows");
  console.log("\n[13/15] Migrating individual flows...");
  await migrateFlows(IND_SQL, "individual", idMaps.indFlows, "indFlows");

  console.log("\n[14a/15] Migrating enterprise flow group users...");
  await migrateFlowGroupUsers(
    ENT_SQL,
    "enterprise",
    idMaps.entFlows,
    idMaps.entGroups,
    "entFlowGroupUsers",
  );
  console.log("\n[14b/15] Migrating individual flow group users...");
  await migrateFlowGroupUsers(
    IND_SQL,
    "individual",
    idMaps.indFlows,
    idMaps.indGroups,
    "indFlowGroupUsers",
  );

  console.log("\n[15a/15] Migrating flow limits...");
  await migrateFlowLimits(ENT_SQL, "enterprise", "entFlowLimits");
  await migrateFlowLimits(IND_SQL, "individual", "indFlowLimits");

  // Must run AFTER both flow_limit passes so a user present in both apps gets
  // both columns from one update.
  await applyFlowAllowances();

  await migrateFlowPublishes();

  console.log("\n[15c/15] Migrating issues...");
  await migrateIssues(ENT_SQL, "enterprise", "entIssues");
  await migrateIssues(IND_SQL, "individual", "indIssues");

  await migrateTransactions();
  await migrateChat();
  await migrateSmallTables();

  await verifyMigration();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ Migration complete in ${elapsed}s`);

  await generateReport();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("\n❌ Migration failed:", err.message);
  console.error(err.stack);
  prisma.$disconnect();
  process.exit(1);
});
