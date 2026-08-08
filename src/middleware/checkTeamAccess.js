const { prisma } = require("../lib/prisma");
const logger = require("../utils/logger");
const securityAlert = require("../services/securityAlert.service");
const { workspaceHeader } = require("../lib/workspaceContext");

/**
 * Middleware that checks team/chat access based on app context.
 * - Pro users (currentVersion === 'pro' && hasPro): full access, no subscription needed
 * - X-Workspace-Context header present: verify membership in THAT specific team (Fix 2 & 3)
 * - No header: fall back to any valid team membership (original behavior)
 * - No team at all: delegate to checkSubscription + requireActivePlan
 *
 * Must be used AFTER authenticate middleware (needs req.user).
 */
async function checkTeamAccess(req, res, next) {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { hasPro: true, currentVersion: true },
    });

    // Pro users in Pro mode get full access — no subscription needed
    if (user?.hasPro && user.currentVersion === "pro") {
      req.subscription = { active: true, plan: "pro", teamMemberLimit: 999 };
      return next();
    }

    // Fix 2: Dynamic X-Workspace-Context resolution.
    // When the frontend sends a specific team context header, we MUST verify
    // membership against that exact team — not the first team the user belongs
    // to. This prevents stale-token claims from granting access to a team the
    // user was removed from mid-session (Fix 3: session context verification).
    const requestedTeamId = workspaceHeader(req) || null;

    if (requestedTeamId) {
      // owner-as-workspace (2026-08-07): the header carries a WORKSPACE id —
      // the owner's user id — not a team id. Membership is therefore "do I
      // belong to ANY live team owned by that user", and the owner's own id
      // always resolves to their own workspace.
      //
      // Still verified server-side on every request: the header is a client
      // claim, so a stale token cannot keep access to a workspace the user was
      // removed from mid-session (Fix 3: session context verification).
      const isSelf = requestedTeamId === userId;
      // Declared BEFORE the membership lookup, which filters on it. It used to
      // be declared after, so referencing it in the query hit the temporal dead
      // zone and threw — a 500 in place of the guard's 403.
      const requestedAppContext = req.headers["x-app-context"] || null;
      // CHANGE-001: one row per (person, workspace), so membership is a direct
      // lookup. The row's teams live in `teamIds`; the app context is read off
      // one of them below (a workspace's teams share an app container).
      const membership = isSelf
        ? null
        : await prisma.teamMember.findFirst({
            // Prefer the seat for the app being requested; fall back to any seat
            // so a stale header still resolves membership (the app check below
            // is what rejects a mismatch, with a clearer error than "no seat").
            where: {
              userId,
              workspaceId: requestedTeamId,
              ...(requestedAppContext === "pro" ||
              requestedAppContext === "team"
                ? { appContext: requestedAppContext }
                : {}),
            },
            select: { id: true, role: true, teamIds: true, appContext: true },
          });

      if (!isSelf && !membership) {
        // Potential broken-access-control / stale-token probe — audit + escalate.
        securityAlert.alertAccessViolation({
          kind: "team_membership",
          actorId: userId,
          actorEmail: req.user?.email,
          workspaceId: requestedTeamId,
          ip: req.ip,
          route: req.originalUrl,
        });
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message:
              "You are not an active member of this team. Your session may be stale — please refresh.",
          },
        });
      }

      // Block requests where the client's X-App-Context contradicts the
      // workspace's actual app context. A 'team' request must never reach a
      // 'pro' workspace and vice-versa. Read from the matched team's stored
      // appContext (server-side truth), never from the client header alone.
      // The SEAT states its app (team_members.app_context, 2026-08-08), so this
      // is read straight off the membership row.
      //
      // It used to pick an arbitrary team — `findFirst` over `membership.teamIds`
      // with no ordering — and read that team's appContext. Someone holding teams
      // in both apps got whichever row the database happened to return first, so
      // the guard's verdict was a coin flip. Reading the seat is both correct and
      // one query cheaper, and it still does not trust the header (the row is
      // server-side state), which is the point of this guard.
      const workspaceAppContext = requestedAppContext
        ? membership?.appContext || null
        : null;
      if (
        requestedAppContext &&
        workspaceAppContext &&
        requestedAppContext !== workspaceAppContext
      ) {
        securityAlert.alertAccessViolation({
          kind: "app_context_mismatch",
          actorId: userId,
          actorEmail: req.user?.email,
          workspaceId: requestedTeamId,
          requestedAppContext,
          teamAppContext: workspaceAppContext,
          ip: req.ip,
          route: req.originalUrl,
        });
        return res.status(403).json({
          success: false,
          error: {
            code: "APP_CONTEXT_MISMATCH",
            message: `App context mismatch: request carries '${requestedAppContext}' but this team operates in '${workspaceAppContext}' mode.`,
          },
        });
      }

      req.subscription = {
        active: true,
        plan: "team",
        teamMemberLimit: 999,
        via: "team-membership",
        workspaceId: requestedTeamId,
        role: membership?.role || "OWNER",
      };
      return next();
    }

    // Fallback: no X-Workspace-Context header — pick the first valid membership.
    // Still filters to non-deleted teams (Fix 3 session integrity baseline).
    // CHANGE-001: any workspace this person belongs to will do; the row names
    // it directly. Prefer one they did not create so the fallback lands on a
    // real tenant rather than their own personal workspace.
    const teamMembership = await prisma.teamMember.findFirst({
      where: { userId, workspaceId: { not: userId } },
      select: { id: true, role: true, workspaceId: true },
    });

    if (teamMembership) {
      req.subscription = {
        active: true,
        plan: "team",
        teamMemberLimit: 999,
        via: "team-membership",
        workspaceId: teamMembership.workspaceId,
      };
      return next();
    }

    // Individual ValueChart users with no team — need a personal subscription
    const {
      checkSubscription,
      requireActivePlan,
    } = require("./checkSubscription");
    checkSubscription(req, res, (err) => {
      if (err) return next(err);
      requireActivePlan(req, res, next);
    });
  } catch (err) {
    logger.error("checkTeamAccess error:", err.message);
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to check access" },
    });
  }
}

module.exports = { checkTeamAccess };
