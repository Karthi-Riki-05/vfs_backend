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

module.exports = { sendPushNotification, sendToUser };
