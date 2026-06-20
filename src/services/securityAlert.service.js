const crypto = require("crypto");
const { prisma } = require("../lib/prisma");
const logger = require("../utils/logger");
const { sendEmail } = require("../utils/email");
const notificationService = require("./notification.service");

const sha256 = (v) =>
  crypto
    .createHash("sha256")
    .update(String(v || ""))
    .digest("hex");

/**
 * Structured security alerting + audit logging.
 *
 * DESIGN RULES (do not break):
 * - Every exported function is FAIL-OPEN: it self-catches and resolves.
 *   It is invoked fire-and-forget from the request path and must NEVER reject
 *   or throw — a broken alert pipeline must not turn a 403 into a 500.
 * - The audit trail is a structured Winston channel (logger.warn with a
 *   SECURITY_AUDIT tag + meta), NOT a DB table — there is no SystemAudit model
 *   in the schema. Persisting to a table is a separate db-agent migration.
 * - In-app alerts go through notification.service; email is best-effort
 *   (sendEmail already no-ops when SMTP is unconfigured).
 */

const SECURITY_AUDIT = "SECURITY_AUDIT";

/** Single structured audit sink. Never throws. */
function audit(event, severity, meta) {
  try {
    const level =
      severity === "critical" || severity === "high" ? "warn" : "info";
    logger[level](`[${SECURITY_AUDIT}] ${event}`, {
      tag: SECURITY_AUDIT,
      event,
      severity,
      ...meta,
    });
  } catch {
    /* logging must never break the caller */
  }
}

/** Resolve the owner + admins of a team so we know who to notify. */
async function getTeamEscalationTargets(teamId) {
  if (!teamId) return [];
  try {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        teamOwnerId: true,
        owner: { select: { id: true, email: true, name: true } },
        members: {
          where: { role: { in: ["OWNER", "ADMIN"] } },
          select: { user: { select: { id: true, email: true, name: true } } },
        },
      },
    });
    if (!team) return [];
    const targets = new Map();
    if (team.owner) targets.set(team.owner.id, team.owner);
    for (const m of team.members || []) {
      if (m.user) targets.set(m.user.id, m.user);
    }
    return [...targets.values()];
  } catch (err) {
    audit("escalation_target_lookup_failed", "low", {
      teamId,
      error: err.message,
    });
    return [];
  }
}

/**
 * (1) Invite rate-limit breach. Fired from rateLimiter's inviteLimiter handler
 * when a user trips the 429. Notifies the team owner/admins so abuse of the
 * invite endpoint is visible, and writes an audit record.
 */
async function alertInviteRateLimit({
  actorId,
  actorEmail,
  teamId,
  ip,
  route,
}) {
  try {
    audit("invite_rate_limit_breach", "high", {
      actorId,
      actorEmail,
      teamId,
      ip,
      route,
    });

    const targets = await getTeamEscalationTargets(teamId);
    const title = "Invite rate limit reached";
    const message = `${actorEmail || actorId || "A member"} hit the team invite rate limit. Repeated breaches may indicate invite abuse.`;

    await Promise.allSettled(
      targets.map((t) =>
        Promise.allSettled([
          notificationService.createNotification(
            t.id,
            "SECURITY_ALERT",
            title,
            message,
            "/dashboard/teams",
            { kind: "invite_rate_limit", actorId, teamId, ip },
            "team",
            teamId,
          ),
          sendEmail({
            to: t.email,
            subject: "⚠️ Invite rate limit reached on your team",
            html: `<p>Hi ${t.name || "there"},</p><p>${message}</p><p>If this wasn't expected, review your team members.</p>`,
            text: `${title}\n\n${message}`,
          }),
        ]),
      ),
    );
  } catch (err) {
    audit("alert_invite_rate_limit_failed", "low", { error: err.message });
  }
}

/**
 * (2) IDOR / context-mismatch escalation. Fired from checkTeamAccess when a
 * request is rejected for accessing a team the user isn't an active member of,
 * or when X-App-Context contradicts the team's stored context. These are
 * potential broken-access-control / stale-token attacks, so we always audit
 * and (when we can resolve a team) notify the owner.
 */
async function alertAccessViolation({
  kind, // "team_membership" | "app_context_mismatch"
  actorId,
  actorEmail,
  teamId,
  requestedAppContext,
  teamAppContext,
  ip,
  route,
}) {
  try {
    audit(`access_violation:${kind}`, "high", {
      actorId,
      actorEmail,
      teamId,
      requestedAppContext,
      teamAppContext,
      ip,
      route,
    });

    // Only escalate to humans for a resolvable team; orphan attempts are
    // audit-only (no owner to notify, and avoids notification spam).
    const targets = await getTeamEscalationTargets(teamId);
    if (!targets.length) return;

    const title = "Blocked access attempt on your team";
    const message =
      kind === "app_context_mismatch"
        ? `A request tried to access your team with a mismatched app context (sent '${requestedAppContext}', team is '${teamAppContext}').`
        : `${actorEmail || actorId || "Someone"} attempted to access your team without an active membership. Their session may be stale, or this may be an access-control probe.`;

    await Promise.allSettled(
      targets.map((t) =>
        notificationService.createNotification(
          t.id,
          "SECURITY_ALERT",
          title,
          message,
          "/dashboard/teams",
          { kind, actorId, teamId, ip },
          "team",
          teamId,
        ),
      ),
    );
  } catch (err) {
    audit("alert_access_violation_failed", "low", { error: err.message });
  }
}

/**
 * (3a) New device / IP sign-in. Call from auth.service AFTER login succeeds,
 * only when the caller has determined the device/IP is new (see note in the
 * controller wiring section — detection needs a place to persist seen devices).
 */
async function alertNewDeviceLogin({ userId, email, name, ip, userAgent }) {
  try {
    audit("new_device_login", "medium", { userId, email, ip, userAgent });
    await Promise.allSettled([
      notificationService.createNotification(
        userId,
        "SECURITY_ALERT",
        "New sign-in to your account",
        `We detected a sign-in from a new device or location (${ip || "unknown IP"}). If this was you, no action is needed.`,
        "/dashboard/settings/security",
        { kind: "new_device_login", ip, userAgent },
        "pro",
        null,
      ),
      sendEmail({
        to: email,
        subject: "🔐 New sign-in to your ValueChart account",
        html: `<p>Hi ${name || "there"},</p><p>Your account was just accessed from a new device or location.</p><ul><li>IP: ${ip || "unknown"}</li><li>Device: ${userAgent || "unknown"}</li></ul><p>If this wasn't you, change your password immediately.</p>`,
        text: `New sign-in from ${ip || "unknown"} (${userAgent || "unknown"}). If this wasn't you, change your password immediately.`,
      }),
    ]);
  } catch (err) {
    audit("alert_new_device_failed", "low", { error: err.message });
  }
}

/**
 * (3a-driver) Record the login device and fire a new-device alert when the
 * (userId, ipHash, uaHash) tuple has never been seen. Fire-and-forget from the
 * login controller — never throws, never blocks the login response.
 * The FIRST-EVER device for a user is recorded silently (no alert), so existing
 * users aren't spammed on their next login after this ships.
 */
async function checkLoginDevice({ userId, email, name, ip, userAgent }) {
  try {
    const ipHash = sha256(ip);
    const uaHash = sha256(userAgent);

    const existing = await prisma.userDevice.findUnique({
      where: { userId_ipHash_uaHash: { userId, ipHash, uaHash } },
      select: { id: true },
    });

    if (existing) {
      await prisma.userDevice.update({
        where: { id: existing.id },
        data: { lastSeen: new Date() },
      });
      return;
    }

    const isFirstEver =
      (await prisma.userDevice.count({ where: { userId } })) === 0;

    await prisma.userDevice.create({ data: { userId, ipHash, uaHash } });

    if (!isFirstEver) {
      await alertNewDeviceLogin({ userId, email, name, ip, userAgent });
    }
  } catch (err) {
    audit("check_login_device_failed", "low", { userId, error: err.message });
  }
}

/**
 * (3b) Password change confirmation. Call from auth.service AFTER a password
 * is successfully changed/reset.
 */
async function alertPasswordChanged({ userId, email, name, ip, userAgent }) {
  try {
    audit("password_changed", "medium", { userId, email, ip, userAgent });
    const origin = `${ip ? ` from IP ${ip}` : ""}${
      userAgent ? ` using ${userAgent}` : ""
    }`;
    await Promise.allSettled([
      notificationService.createNotification(
        userId,
        "SECURITY_ALERT",
        "Your password was changed",
        "Your account password was just changed. If you didn't do this, reset your password and contact support immediately.",
        "/dashboard/settings/security",
        { kind: "password_changed", ip, userAgent },
        "pro",
        null,
      ),
      sendEmail({
        to: email,
        subject: "🔐 Your ValueChart password was changed",
        html: `<p>Hi ${name || "there"},</p><p>Your password was just changed${origin}.</p><ul><li>IP: ${ip || "unknown"}</li><li>Device: ${userAgent || "unknown"}</li></ul><p>If this wasn't you, reset your password and contact support immediately.</p>`,
        text: `Your ValueChart password was changed${origin}. If this wasn't you, reset it and contact support.`,
      }),
    ]);
  } catch (err) {
    audit("alert_password_changed_failed", "low", { error: err.message });
  }
}

module.exports = {
  alertInviteRateLimit,
  alertAccessViolation,
  alertNewDeviceLogin,
  checkLoginDevice,
  alertPasswordChanged,
  // exported for unit tests / reuse
  audit,
  getTeamEscalationTargets,
};
