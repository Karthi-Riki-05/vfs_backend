const admin = require("firebase-admin");
const { prisma } = require("../lib/prisma");
const logger = require("../utils/logger");

let initialized = false;

function init() {
  if (initialized) return;
  if (!process.env.FIREBASE_PROJECT_ID) return; // skip in dev when not configured
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(
        /\\n/g,
        "\n",
      ),
    }),
  });
  initialized = true;
}

// FCM error codes that mean the token is permanently dead — purge on sight.
//
// `mismatched-credential` ("SenderId mismatch") is included because an FCM
// token is permanently bound to the Firebase sender id that issued it. If the
// project ever changes (as it did 2026-08-10, valuecharts-185f0 →
// value-charts-6b9c6), every pre-existing token becomes undeliverable. Without
// treating it as stale those rows are never cleaned up and fail on EVERY send
// forever, because the device only re-registers into a row that no longer
// collides. Purging lets the next app launch write a fresh, valid token.
const STALE_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/mismatched-credential",
]);

function isStaleTokenError(e) {
  return !!e && STALE_TOKEN_CODES.has(e.code);
}

// Best-effort removal of a dead device row. Never throws into the send path.
async function purgeToken(fcmToken) {
  try {
    await prisma.firebaseUser.deleteMany({ where: { fcmToken } });
  } catch (e) {
    console.error("[FCM] purgeToken failed:", e.message);
  }
}

async function sendPushNotification(fcmToken, title, body, data = {}) {
  try {
    init();
    if (!initialized) return { success: false, error: "FCM not configured" };
    const stringData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)]),
    );
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: stringData,
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default" } } },
      webpush: data.url
        ? { fcmOptions: { link: String(data.url) } }
        : undefined,
    });
    return { success: true };
  } catch (e) {
    // Per-user sends now self-heal: a dead token is purged from the DB so it
    // never accumulates (previously only broadcastToAll cleaned up).
    if (isStaleTokenError(e)) {
      await purgeToken(fcmToken);
      console.error(`[FCM] purged stale token (${e.code})`);
    } else {
      console.error("[FCM] send failed:", e.message);
    }
    return { success: false, error: e.message };
  }
}

// Fan out across every active device registered to the user. When
// `appContext` ("pro" | "team") is given, devices are narrowed to that app
// PLUS any legacy device registered before the appContext column existed
// (appContext: null) — fail-open so no existing user silently stops getting
// push after the migration. Omitting appContext preserves the old
// send-to-every-device behaviour for callers that haven't been updated yet.
async function sendToUser(userId, title, body, data = {}, appContext = null) {
  const where = { userId, fcmToken: { not: null }, deletedAt: null };
  if (appContext) {
    where.OR = [{ appContext: null }, { appContext }];
  }
  const devices = await prisma.firebaseUser.findMany({
    where,
    select: { fcmToken: true },
  });
  if (devices.length === 0) return { success: false, error: "No FCM token" };

  const results = await Promise.all(
    devices.map((d) => sendPushNotification(d.fcmToken, title, body, data)),
  );
  const sent = results.filter((r) => r.success).length;
  return {
    success: sent > 0,
    sent,
    failed: results.length - sent,
    total: results.length,
  };
}

async function broadcastToAll(title, body, data = {}) {
  init();
  if (!initialized) return { success: false, error: "FCM not configured" };
  const rows = await prisma.firebaseUser.findMany({
    where: { fcmToken: { not: null }, deletedAt: null },
    select: { id: true, fcmToken: true },
  });
  if (rows.length === 0) return { success: true, sent: 0, failed: 0, total: 0 };

  const stringData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v)]),
  );
  // bug-149: Firebase rejects sendEachForMulticast above 500 tokens per call.
  // This used to send every token in ONE call, so the whole broadcast failed
  // outright the moment the install base passed 500 — not a partial send, no
  // send at all, and the console reported nothing wrong. Chunk it.
  const CHUNK = 500;
  const stale = [];
  let sent = 0;
  let failed = 0;
  const errors = [];

  for (let offset = 0; offset < rows.length; offset += CHUNK) {
    const slice = rows.slice(offset, offset + CHUNK);
    try {
      const res = await admin.messaging().sendEachForMulticast({
        tokens: slice.map((r) => r.fcmToken),
        notification: { title, body },
        data: stringData,
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
        webpush: data.url ? { fcmOptions: { link: data.url } } : undefined,
      });
      sent += res.successCount;
      failed += res.failureCount;
      // Clean up tokens FCM says are permanently dead. Uses the shared
      // STALE_TOKEN_CODES via isStaleTokenError so this path can never drift
      // from the single-send path above.
      res.responses.forEach((r, i) => {
        if (!r.success && isStaleTokenError(r.error)) stale.push(slice[i].id);
      });
    } catch (err) {
      // One bad chunk must not sink the rest of the broadcast — the remaining
      // batches still go out and the failure is reported back to the caller.
      failed += slice.length;
      errors.push(err.message);
      logger.error(
        `[FCM] broadcast chunk ${offset / CHUNK + 1} failed: ${err.message}`,
      );
    }
  }

  if (stale.length > 0) {
    await prisma.firebaseUser.deleteMany({ where: { id: { in: stale } } });
  }

  return {
    success: true,
    total: rows.length,
    batches: Math.ceil(rows.length / CHUNK),
    sent,
    failed,
    cleaned: stale.length,
    ...(errors.length ? { errors } : {}),
  };
}

module.exports = { sendPushNotification, sendToUser, broadcastToAll };
