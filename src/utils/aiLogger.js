// AI request logger — writes one JSON line per AI call into
// backend/logs/ai/ai-YYYY-MM-DD.log. Captures userId, app, plan,
// model, endpoint, success, durationMs. Failures are swallowed
// (logged to console) so the user request is never affected.

const fs = require("fs");
const path = require("path");
const { getTierByUserId } = require("./userTier");
const { prisma } = require("../lib/prisma");

const LOG_DIR = path.join(process.cwd(), "logs", "ai");

let _dirReady = false;
function ensureDir() {
  if (_dirReady) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    _dirReady = true;
  } catch (err) {
    console.error("[aiLogger] mkdir failed:", err.message);
  }
}

function fileForToday() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return path.join(LOG_DIR, `ai-${y}-${m}-${day}.log`);
}

// Resolve the user's plan label. Prefers the explicit `plan` arg
// (so callers that already know the tier avoid an extra DB hit),
// otherwise looks it up via userTier.
async function resolvePlan(userId, planHint) {
  if (planHint) return planHint;
  if (!userId) return "anon";
  try {
    return await getTierByUserId(userId);
  } catch {
    return "unknown";
  }
}

// Resolve the user's current app (free / pro / team) from
// users.currentVersion when the caller doesn't pass one in.
async function resolveApp(userId, appHint) {
  if (appHint) return appHint;
  if (!userId) return "anon";
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { currentVersion: true },
    });
    return u?.currentVersion || "free";
  } catch {
    return "unknown";
  }
}

async function logAiRequest({
  userId = null,
  app = null,
  plan = null,
  model = null,
  endpoint = null,
  success = true,
  durationMs = null,
  error = null,
  meta = null,
}) {
  try {
    ensureDir();
    const [resolvedPlan, resolvedApp] = await Promise.all([
      resolvePlan(userId, plan),
      resolveApp(userId, app),
    ]);
    const entry = {
      ts: new Date().toISOString(),
      userId: userId || "anon",
      app: resolvedApp,
      plan: resolvedPlan,
      model: model || "unknown",
      endpoint: endpoint || "unknown",
      success,
      ...(durationMs !== null ? { durationMs } : {}),
      ...(error ? { error: String(error).slice(0, 500) } : {}),
      ...(meta ? { meta } : {}),
    };
    fs.appendFile(fileForToday(), JSON.stringify(entry) + "\n", (err) => {
      if (err) console.error("[aiLogger] append failed:", err.message);
    });
  } catch (err) {
    console.error("[aiLogger] log failed:", err.message);
  }
}

module.exports = { logAiRequest };
