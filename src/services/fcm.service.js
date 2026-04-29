const admin = require("firebase-admin");
const { prisma } = require("../lib/prisma");

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
    });
    return { success: true };
  } catch (e) {
    console.error("[FCM] send failed:", e.message);
    return { success: false, error: e.message };
  }
}

async function sendToUser(userId, title, body, data = {}) {
  const fb = await prisma.firebaseUser.findFirst({ where: { userId } });
  if (!fb || !fb.fcmToken) return { success: false, error: "No FCM token" };
  return sendPushNotification(fb.fcmToken, title, body, data);
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
  const tokens = rows.map((r) => r.fcmToken);

  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: stringData,
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default" } } },
    webpush: data.url ? { fcmOptions: { link: data.url } } : undefined,
  });

  // Clean up tokens FCM says are no longer registered
  const stale = [];
  res.responses.forEach((r, i) => {
    if (
      !r.success &&
      (r.error?.code === "messaging/registration-token-not-registered" ||
        r.error?.code === "messaging/invalid-registration-token")
    ) {
      stale.push(rows[i].id);
    }
  });
  if (stale.length > 0) {
    await prisma.firebaseUser.updateMany({
      where: { id: { in: stale } },
      data: { fcmToken: null },
    });
  }

  return {
    success: true,
    total: rows.length,
    sent: res.successCount,
    failed: res.failureCount,
    cleaned: stale.length,
  };
}

module.exports = { sendPushNotification, sendToUser, broadcastToAll };
