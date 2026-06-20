const { prisma } = require("../lib/prisma");
const logger = require("../utils/logger");
const securityAlert = require("../services/securityAlert.service");

/**
 * Middleware that checks team/chat access based on app context.
 * - Pro users (currentVersion === 'pro' && hasPro): full access, no subscription needed
 * - X-Team-Context header present: verify membership in THAT specific team (Fix 2 & 3)
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

    // Fix 2: Dynamic X-Team-Context resolution.
    // When the frontend sends a specific team context header, we MUST verify
    // membership against that exact team — not the first team the user belongs
    // to. This prevents stale-token claims from granting access to a team the
    // user was removed from mid-session (Fix 3: session context verification).
    const requestedTeamId = req.headers["x-team-context"] || null;

    if (requestedTeamId) {
      // Fetch the team record and membership in parallel.
      // We need the team's stored appContext to detect cross-context attacks
      // (e.g. a client claiming X-App-Context: team against a Pro team).
      const [team, membership] = await Promise.all([
        prisma.team.findFirst({
          where: { id: requestedTeamId, deletedAt: null },
          select: { id: true, appContext: true },
        }),
        prisma.teamMember.findFirst({
          where: {
            userId,
            teamId: requestedTeamId,
            team: { deletedAt: null }, // Fix 3: reject deleted/inactive teams
          },
          select: { id: true, role: true, teamId: true },
        }),
      ]);

      if (!team || !membership) {
        // Potential broken-access-control / stale-token probe — audit + escalate.
        securityAlert.alertAccessViolation({
          kind: "team_membership",
          actorId: userId,
          actorEmail: req.user?.email,
          teamId: requestedTeamId,
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

      // Block requests where the client's X-App-Context header contradicts
      // the team's actual appContext stored in the database. A 'team'-context
      // request must never access a 'pro' team and vice-versa.
      const requestedAppContext = req.headers["x-app-context"] || null;
      if (
        requestedAppContext &&
        team.appContext &&
        requestedAppContext !== team.appContext
      ) {
        securityAlert.alertAccessViolation({
          kind: "app_context_mismatch",
          actorId: userId,
          actorEmail: req.user?.email,
          teamId: requestedTeamId,
          requestedAppContext,
          teamAppContext: team.appContext,
          ip: req.ip,
          route: req.originalUrl,
        });
        return res.status(403).json({
          success: false,
          error: {
            code: "APP_CONTEXT_MISMATCH",
            message: `App context mismatch: request carries '${requestedAppContext}' but this team operates in '${team.appContext}' mode.`,
          },
        });
      }

      req.subscription = {
        active: true,
        plan: "team",
        teamMemberLimit: 999,
        via: "team-membership",
        teamId: requestedTeamId,
        role: membership.role,
      };
      return next();
    }

    // Fallback: no X-Team-Context header — pick the first valid membership.
    // Still filters to non-deleted teams (Fix 3 session integrity baseline).
    const teamMembership = await prisma.teamMember.findFirst({
      where: {
        userId,
        team: { deletedAt: null },
      },
      select: { id: true, role: true, teamId: true },
    });

    if (teamMembership) {
      req.subscription = {
        active: true,
        plan: "team",
        teamMemberLimit: 999,
        via: "team-membership",
        teamId: teamMembership.teamId,
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
