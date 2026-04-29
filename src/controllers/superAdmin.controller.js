const argon2 = require("argon2");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { prisma } = require("../lib/prisma");
const { getStripe } = require("../lib/stripe");
const fcmService = require("../services/fcm.service");

/**
 * Builds (but doesn't execute) the PrismaPromise that archives the given
 * Subscription into SubscriptionHistory. Caller fetches the sub (with plan
 * included) first, then passes it in. Returns null if sub is nullish.
 *
 * MUST be synchronous — an async fn would resolve the PrismaPromise before
 * $transaction gets to see it, causing the "All elements of the array need
 * to be Prisma Client promises" error.
 */
function buildArchiveSubscriptionOp(sub, reason, archivedBy = null) {
  if (!sub) return null;
  return prisma.subscriptionHistory.create({
    data: {
      userId: sub.userId,
      planName: sub.plan?.name || null,
      productType: sub.productType || null,
      status: sub.status,
      price: sub.price,
      currency: sub.currency,
      isRecurring: sub.isRecurring,
      source: sub.isRecurring ? "stripe" : "admin",
      startedAt: sub.startedAt,
      expiresAt: sub.expiresAt,
      archivedReason: reason,
      archivedBy,
      stripePaymentId: sub.paymentId,
      snapshot: {
        id: sub.id,
        planId: sub.planId,
        usersCount: sub.usersCount,
        appType: sub.appType,
        subType: sub.subType,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
      },
    },
  });
}

class SuperAdminController {
  getDashboardStats = asyncHandler(async (req, res) => {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeToday,
      proUsers,
      todaySignups,
      totalFlows,
      totalAiCreditsAgg,
      activeSubscriptions,
      recentSignupsRaw,
      planDistribution,
      aiUsageByModel,
      recentSignupUsers,
      valueChartCount,
      valueChartProCount,
    ] = await Promise.all([
      prisma.user.count({ where: { userStatus: { not: "deleted" } } }),
      prisma.user.count({ where: { lastSeen: { gte: last24h } } }),
      prisma.user.count({ where: { hasPro: true } }),
      prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.flow.count({ where: { deletedAt: null } }),
      prisma.aiCreditUsage.aggregate({ _sum: { creditsUsed: true } }),
      prisma.subscription.count({ where: { status: "active" } }),
      prisma.$queryRaw`
        SELECT DATE(created_at) as date, COUNT(*)::int as count
        FROM users
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,
      prisma.user.groupBy({
        by: ["currentVersion"],
        _count: { id: true },
      }),
      prisma.aiCreditUsage.groupBy({
        by: ["model"],
        _sum: { creditsUsed: true },
        where: { createdAt: { gte: last30d } },
      }),
      prisma.user.findMany({
        where: { userStatus: { not: "deleted" } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          hasPro: true,
          currentVersion: true,
          createdAt: true,
        },
      }),
      // ValueChart app = currentVersion in free/pro (individual app)
      prisma.user.count({
        where: {
          userStatus: { not: "deleted" },
          currentVersion: { in: ["free", "pro"] },
        },
      }),
      // ValueChart Pro app = currentVersion team (enterprise app)
      prisma.user.count({
        where: {
          userStatus: { not: "deleted" },
          currentVersion: "team",
        },
      }),
    ]);

    // Serialize raw query result (Date → ISO string)
    const recentSignups = recentSignupsRaw.map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
      count: Number(r.count),
    }));

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          activeToday,
          proUsers,
          todaySignups,
          totalFlows,
          totalAiCreditsUsed: totalAiCreditsAgg._sum.creditsUsed || 0,
          activeSubscriptions,
        },
        appBreakdown: {
          valuechart: valueChartCount,
          valueChartPro: valueChartProCount,
        },
        charts: {
          recentSignups,
          planDistribution: planDistribution.map((p) => ({
            plan: p.currentVersion,
            count: p._count.id,
          })),
          aiUsageByModel: aiUsageByModel.map((m) => ({
            model: m.model || "unknown",
            credits: m._sum.creditsUsed || 0,
          })),
        },
        recentSignupUsers,
      },
    });
  });

  getUsers = asyncHandler(async (req, res) => {
    const {
      search = "",
      page = 1,
      limit = 25,
      plan,
      status,
      deviceType,
      sortBy = "createdAt",
      sortOrder = "desc",
      dateFrom,
      dateTo,
      appContext, // 'valuechartpro' | 'valuechartteams' | 'all' (legacy alias: 'valuechart' → 'valuechartpro')
      freeOnly, // when 'true' → only list users eligible for a new grant (free, not suspended, no active sub)
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * take;

    const where = {};

    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: "insensitive" } },
        { email: { contains: String(search), mode: "insensitive" } },
      ];
    }

    if (plan === "pro") where.hasPro = true;
    else if (plan === "free") where.currentVersion = "free";
    else if (plan === "team") where.currentVersion = "team";

    if (status === "suspended") where.suspendedAt = { not: null };
    else if (status === "deleted") where.userStatus = "deleted";
    else if (status === "active") {
      where.userStatus = "success";
      where.suspendedAt = null;
    }

    if (deviceType) where.clientType = deviceType;

    // App partition: ValueChart Pro = free+pro (individual), ValueChart Teams = team (enterprise)
    // Legacy alias: 'valuechart' → 'valuechartpro' (individual)
    const normalizedAppContext =
      appContext === "valuechart" ? "valuechartpro" : appContext;
    if (normalizedAppContext === "valuechartpro") {
      where.currentVersion = where.currentVersion || { in: ["free", "pro"] };
    } else if (normalizedAppContext === "valuechartteams") {
      where.currentVersion = "team";
    }

    // freeOnly: eligible-for-grant filter — free tier, active (not suspended, not deleted).
    // Users with old cancelled/expired subscriptions are still eligible — only ACTIVE subs block
    // a grant (enforced in grantSubscription controller, not here).
    if (freeOnly === "true" || freeOnly === true) {
      where.currentVersion = "free";
      where.userStatus = "success";
      where.suspendedAt = null;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const allowedSortFields = new Set([
      "createdAt",
      "updatedAt",
      "lastSeen",
      "name",
      "email",
    ]);
    const safeSortBy = allowedSortFields.has(String(sortBy))
      ? String(sortBy)
      : "createdAt";
    const safeSortOrder = sortOrder === "asc" ? "asc" : "desc";

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { [safeSortBy]: safeSortOrder },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          hasPro: true,
          currentVersion: true,
          clientType: true,
          userStatus: true,
          userType: true,
          lastSeen: true,
          createdAt: true,
          suspendedAt: true,
          adminNote: true,
          stripeCustomerId: true,
          proFlowLimit: true,
          proUnlimitedFlows: true,
          _count: {
            select: {
              flows: { where: { deletedAt: null } },
              aiCreditUsages: true,
            },
          },
          subscription: {
            select: {
              status: true,
              productType: true,
              expiresAt: true,
              price: true,
            },
          },
          aiCreditBalance: {
            select: {
              planCredits: true,
              addonCredits: true,
              planResetsAt: true,
            },
          },
          accounts: {
            select: { provider: true },
            take: 1,
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          total,
          page: pageNum,
          limit: take,
          totalPages: Math.ceil(total / take),
        },
      },
    });
  });

  createUser = asyncHandler(async (req, res) => {
    const {
      name,
      email,
      password,
      plan = "free",
      adminNote,
      status = "active", // 'active' | 'inactive'
      appType = "valuechartpro", // 'valuechartpro' (individual: Free/Pro) | 'valuechartteams' (enterprise: Team). Legacy 'valuechart' → 'valuechartpro'.
      duration = "monthly", // 'monthly' | 'yearly' — used by pro/team
      months, // optional override for expiry (integer)
      seats, // team only — 5/10/15/20/25/30
      inviteEmails, // team only — string[]
      flowLimit, // pro/team only — integer override for user.proFlowLimit (0 or -1 → unlimited)
    } = req.body;

    if (!name || !email || !password) {
      throw new AppError(
        "Name, email, and password are required",
        400,
        "VALIDATION_ERROR",
      );
    }

    const normalizedEmail = String(email).toLowerCase();
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new AppError("Email already exists", 400, "EMAIL_EXISTS");
    }

    const normalizedPlan = ["free", "pro", "team"].includes(plan)
      ? plan
      : "free";
    const normalizedStatus = status === "inactive" ? "inactive" : "active";
    // Canonical: 'valuechartpro' = individual (Free/Pro), 'valuechartteams' = enterprise (Team)
    // Legacy alias: 'valuechart' (old individual label) → 'valuechartpro'
    const normalizedAppType =
      appType === "valuechartteams" ? "valuechartteams" : "valuechartpro";
    const normalizedDuration = duration === "yearly" ? "yearly" : "monthly";

    // Rule #3 — strict appType ↔ plan coupling (updated spec)
    // ValueChart Pro      → always 'pro' (no plan dropdown in UI)
    // ValueChart Teams    → 'free' or 'team'
    const isTeamPlan = normalizedPlan === "team";
    if (normalizedAppType === "valuechartpro" && normalizedPlan !== "pro") {
      throw new AppError(
        "ValueChart Pro app supports only the Pro plan. Switch App Type to ValueChart Teams for Free or Team.",
        400,
        "APPTYPE_PLAN_MISMATCH",
      );
    }
    if (
      normalizedAppType === "valuechartteams" &&
      !["free", "team"].includes(normalizedPlan)
    ) {
      throw new AppError(
        "ValueChart Teams app supports only Free or Team plans.",
        400,
        "APPTYPE_PLAN_MISMATCH",
      );
    }

    const isPro = normalizedPlan === "pro" || normalizedPlan === "team";

    // Seats: team plan only (Pro defaults to 5 in the Team creation block below).
    const ALLOWED_SEATS = [5, 10, 15, 20, 25, 30];
    let normalizedSeats = null;
    if (isTeamPlan) {
      normalizedSeats = parseInt(seats, 10) || 5;
      if (!ALLOWED_SEATS.includes(normalizedSeats)) {
        throw new AppError(
          `Seats must be one of ${ALLOWED_SEATS.join(", ")}`,
          400,
          "INVALID_SEATS",
        );
      }
    }

    // Invites (optional, for any paid plan since Pro also creates a Team).
    // Max invites = seats-1 (owner takes 1 seat). For Pro the effective cap is 4.
    let normalizedInvites = [];
    if (isPro && Array.isArray(inviteEmails)) {
      normalizedInvites = inviteEmails
        .map((e) =>
          String(e || "")
            .trim()
            .toLowerCase(),
        )
        .filter((e) => e.length > 0);
      normalizedInvites = [...new Set(normalizedInvites)];
      const effectiveSeats = isTeamPlan ? normalizedSeats : 5;
      const maxInvites = effectiveSeats - 1;
      if (normalizedInvites.length > maxInvites) {
        throw new AppError(
          `You can invite at most ${maxInvites} member${maxInvites === 1 ? "" : "s"} (owner takes 1 seat of ${effectiveSeats}).`,
          400,
          "TOO_MANY_INVITES",
        );
      }
      if (normalizedInvites.includes(normalizedEmail)) {
        throw new AppError(
          "You cannot invite the new user's own email.",
          400,
          "CANNOT_INVITE_SELF",
        );
      }
    }
    const hashed = await argon2.hash(String(password));

    // Flow-limit override (pro/team only). Ignored for free.
    //   Sentinel: flowLimit ≤ 0 → proUnlimitedFlows=true, proFlowLimit reset to default.
    //   Positive int → proFlowLimit=<int>, proUnlimitedFlows=false.
    //   undefined/null → leave schema defaults (proFlowLimit=10, unlimited=false for pro;
    //     team plan gets unlimited=true applied below regardless).
    let flowLimitFields = null;
    if (
      isPro &&
      flowLimit !== undefined &&
      flowLimit !== null &&
      flowLimit !== ""
    ) {
      const n = parseInt(flowLimit, 10);
      if (Number.isNaN(n)) {
        throw new AppError(
          "flowLimit must be an integer",
          400,
          "INVALID_FLOW_LIMIT",
        );
      }
      if (n <= 0) {
        flowLimitFields = { proUnlimitedFlows: true };
      } else {
        flowLimitFields = { proFlowLimit: n, proUnlimitedFlows: false };
      }
    }
    // Team plan default = unlimited flows (matches the web team sub behaviour)
    if (isTeamPlan && !flowLimitFields) {
      flowLimitFields = { proUnlimitedFlows: true };
    }

    const planCreditsMap = { team: 300, pro: 100, free: 20 };

    // Resolve/create Plan row for pro/team before the transaction.
    let planRow = null;
    let expiresAt = null;
    if (isPro) {
      const monthsToAdd =
        parseInt(months, 10) || (normalizedDuration === "yearly" ? 12 : 1);
      const now = new Date();
      expiresAt = new Date(now);
      expiresAt.setMonth(expiresAt.getMonth() + monthsToAdd);

      const planName = `${normalizedPlan === "pro" ? "Pro" : "Team"} ${normalizedDuration === "yearly" ? "Yearly" : "Monthly"}`;
      planRow = await prisma.plan.findUnique({ where: { name: planName } });
      if (!planRow) {
        planRow = await prisma.plan.create({
          data: {
            name: planName,
            duration: normalizedDuration,
            price: 0,
            status: "active",
            tier: normalizedPlan === "team" ? 2 : 1,
            appType: normalizedPlan === "team" ? "enterprise" : "individual",
            features: JSON.stringify([
              "Unlimited flows",
              "All shapes",
              "Export all formats",
              ...(normalizedPlan === "team"
                ? ["Team collaboration", "Admin dashboard", "Team management"]
                : []),
              "Priority support",
              "AI diagram generation",
            ]),
          },
        });
      }
    }

    // Pre-resolve invitee user IDs (for any paid plan). Runs before the tx so
    // the tx body stays pure Prisma ops.
    let inviteResolved = { matches: [], skipped: [] };
    if (isPro && normalizedInvites.length > 0) {
      const matched = await prisma.user.findMany({
        where: {
          email: { in: normalizedInvites },
          userStatus: { not: "deleted" },
        },
        select: { id: true, email: true, suspendedAt: true },
      });
      const matchedEmails = new Set(matched.map((u) => u.email));
      inviteResolved = {
        matches: matched.filter((u) => !u.suspendedAt),
        skipped: normalizedInvites.filter((e) => {
          if (!matchedEmails.has(e)) return true;
          const u = matched.find((m) => m.email === e);
          return !!u?.suspendedAt;
        }),
      };
    }

    // Atomic transaction — any failure rolls back user + sub + team + members.
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: String(name),
          email: normalizedEmail,
          password: hashed,
          hasPro: isPro,
          currentVersion: normalizedPlan,
          adminNote: adminNote || null,
          userStatus: "success",
          clientType: "web",
          userType: isPro ? "pro_user" : "free_user",
          suspendedAt: normalizedStatus === "inactive" ? new Date() : null,
          suspendedBy: normalizedStatus === "inactive" ? req.user.id : null,
          ...(isPro ? { proPurchasedAt: new Date() } : {}),
          ...(flowLimitFields || {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          currentVersion: true,
          hasPro: true,
          suspendedAt: true,
          createdAt: true,
          proFlowLimit: true,
          proUnlimitedFlows: true,
        },
      });

      await tx.aiCreditBalance.create({
        data: {
          userId: user.id,
          planCredits: planCreditsMap[normalizedPlan],
          addonCredits: 0,
          planResetsAt: isPro ? expiresAt : null,
          appContext: normalizedPlan,
        },
      });

      let subscription = null;
      if (isPro) {
        subscription = await tx.subscription.create({
          data: {
            userId: user.id,
            planId: planRow.id,
            status: "active",
            startedAt: new Date(),
            expiresAt,
            price: 0,
            isRecurring: false,
            productType: `${normalizedPlan}_${normalizedDuration}`,
            appType: normalizedPlan === "team" ? "enterprise" : "individual",
            usersCount: isTeamPlan ? normalizedSeats : null,
          },
        });
      }

      // Team row creation:
      // - Team plan: user-picked seats (5..30) + invite list.
      // - Pro plan:  create Team with default 5 seats so the user can invite
      //              collaborators later (matches the web Pro flow where the
      //              sidebar exposes Teams after purchase).
      // - Free plan: no Team row — user has no paid entitlement.
      let team = null;
      let addedMembers = [];
      if (isPro) {
        const teamSeats = isTeamPlan ? normalizedSeats : 5;
        const teamAppType =
          normalizedPlan === "team" ? "enterprise" : "individual";
        const teamAppContext = normalizedPlan; // 'pro' or 'team'

        team = await tx.team.create({
          data: {
            name: `${user.name}'s Team`,
            teamOwnerId: user.id,
            teamMem: teamSeats,
            countMem: 1, // owner is member #1
            appType: teamAppType,
            appContext: teamAppContext,
            status: "active",
          },
        });

        // Add owner as first TeamMember (role: OWNER).
        // Mirrors team.service.js:createTeam so the owner shows up in member
        // lists and the member-count invariant (countMem === teamMember rows)
        // holds.
        await tx.teamMember.create({
          data: {
            teamId: team.id,
            userId: user.id,
            role: "OWNER",
            appType: teamAppType,
          },
        });

        if (inviteResolved.matches.length > 0) {
          // Create invitee members sequentially (unique constraint catches
          // dupes inside the tx).
          for (const invitee of inviteResolved.matches) {
            const m = await tx.teamMember.create({
              data: {
                teamId: team.id,
                userId: invitee.id,
                role: "MEMBER",
                appType: teamAppType,
              },
            });
            addedMembers.push(m);
          }
          if (addedMembers.length > 0) {
            await tx.team.update({
              where: { id: team.id },
              data: { countMem: 1 + addedMembers.length },
            });
          }
        }
      }

      return { user, subscription, team, addedMembers };
    });

    res.status(201).json({
      success: true,
      data: {
        ...result.user,
        subscription: result.subscription
          ? {
              id: result.subscription.id,
              status: result.subscription.status,
              productType: result.subscription.productType,
              expiresAt: result.subscription.expiresAt,
            }
          : null,
        team: result.team
          ? {
              id: result.team.id,
              teamMem: result.team.teamMem,
              countMem: 1 + result.addedMembers.length, // owner + invitees
              appContext: result.team.appContext,
            }
          : null,
        invites: isPro
          ? {
              added: result.addedMembers.length,
              skipped: inviteResolved.skipped,
            }
          : null,
      },
    });
  });

  getSubscriptionHistory = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const rows = await prisma.subscriptionHistory.findMany({
      where: { userId },
      orderBy: { archivedAt: "desc" },
      take: 50,
    });
    res.json({ success: true, data: { history: rows } });
  });

  getUserDetail = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: { include: { plan: true } },
        subscriptionHistory: {
          orderBy: { archivedAt: "desc" },
          take: 20,
        },
        aiCreditBalance: true,
        accounts: { select: { provider: true, type: true } },
        sessions: {
          select: { expires: true, sessionToken: true },
          orderBy: { expires: "desc" },
          take: 5,
        },
        flows: {
          where: { deletedAt: null },
          orderBy: { updatedAt: "desc" },
          take: 12,
          select: {
            id: true,
            name: true,
            thumbnail: true,
            updatedAt: true,
            createdAt: true,
          },
        },
        aiConversations: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            title: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { messages: true } },
          },
        },
        firebaseUser: {
          select: { fcmToken: true, fcmUsername: true, updatedAt: true },
        },
        _count: {
          select: {
            flows: { where: { deletedAt: null } },
            aiCreditUsages: true,
            aiConversations: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError("User not found", 404, "NOT_FOUND");
    }

    // Strip password from response
    const { password, refreshToken, rememberToken, ...safe } = user;
    res.json({ success: true, data: safe });
  });

  getUserActivity = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { page = 1, limit = 50, type, dateFrom, dateTo } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const take = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * take;

    const where = { userId };
    if (type) where.action = { contains: String(type), mode: "insensitive" };
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [actions, total] = await Promise.all([
      prisma.userAction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.userAction.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        actions,
        pagination: {
          total,
          page: pageNum,
          limit: take,
          totalPages: Math.ceil(total / take),
        },
      },
    });
  });

  getUserAiUsage = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const now = new Date();
    const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalAgg, thisMonthAgg, byModel, byDayRaw] = await Promise.all([
      prisma.aiCreditUsage.aggregate({
        where: { userId },
        _sum: { creditsUsed: true },
      }),
      prisma.aiCreditUsage.aggregate({
        where: { userId, createdAt: { gte: last30 } },
        _sum: { creditsUsed: true },
      }),
      prisma.aiCreditUsage.groupBy({
        by: ["model"],
        where: { userId },
        _sum: { creditsUsed: true },
      }),
      prisma.$queryRaw`
        SELECT DATE(created_at) as date, COALESCE(SUM(credits_used),0)::int as credits
        FROM ai_credit_usages
        WHERE user_id = ${userId}
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,
    ]);

    res.json({
      success: true,
      data: {
        total: totalAgg._sum.creditsUsed || 0,
        thisMonth: thisMonthAgg._sum.creditsUsed || 0,
        byModel: byModel.map((m) => ({
          model: m.model || "unknown",
          credits: m._sum.creditsUsed || 0,
        })),
        byDay: byDayRaw.map((r) => ({
          date:
            r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
          credits: Number(r.credits),
        })),
      },
    });
  });

  updateUser = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const {
      name,
      email,
      role,
      hasPro,
      currentVersion,
      adminNote,
      proFlowLimit,
      proUnlimitedFlows,
      confirmDowngrade, // ack flag for downgrading a team owner
    } = req.body || {};

    // Prevent self-demotion out of super_admin
    if (
      userId === req.user.id &&
      role !== undefined &&
      role !== "super_admin"
    ) {
      throw new AppError(
        "You cannot remove your own super_admin role",
        400,
        "SELF_DEMOTION_BLOCKED",
      );
    }

    // Rule #3 — Pro → Free downgrade side effects
    let downgradeOps = null;
    if (currentVersion === "free") {
      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          currentVersion: true,
          subscription: { select: { status: true, id: true } },
          ownedTeams: {
            where: { deletedAt: null, status: "active" },
            select: { id: true, _count: { select: { members: true } } },
          },
          teamMemberships: { select: { id: true } },
        },
      });

      const isDowngradingFromPaid =
        current &&
        current.currentVersion !== "free" &&
        (current.subscription?.status === "active" ||
          current.subscription?.status === "cancelling" ||
          current.ownedTeams.length > 0 ||
          current.teamMemberships.length > 0);

      if (isDowngradingFromPaid) {
        const ownedTeam = current.ownedTeams[0];
        const teamMemberCount = ownedTeam?._count.members || 0;

        // Guard: if team owner has members, require explicit confirm
        if (ownedTeam && teamMemberCount > 0 && !confirmDowngrade) {
          throw new AppError(
            `This user owns a team with ${teamMemberCount} member${teamMemberCount === 1 ? "" : "s"}. Pass confirmDowngrade=true to proceed (team will be archived).`,
            409,
            "TEAM_OWNER_DOWNGRADE_CONFIRM_REQUIRED",
          );
        }

        downgradeOps = [];
        // Cancel active/cancelling subscription
        if (
          current.subscription?.status === "active" ||
          current.subscription?.status === "cancelling"
        ) {
          downgradeOps.push(
            prisma.subscription.updateMany({
              where: { userId, status: { in: ["active", "cancelling"] } },
              data: { status: "cancelled", deletedAt: new Date() },
            }),
          );
        }
        // Remove user from any teams they joined as a member
        if (current.teamMemberships.length > 0) {
          downgradeOps.push(
            prisma.teamMember.deleteMany({ where: { userId } }),
          );
        }
        // Archive owned team (soft delete) — members already deleted above if user was a member elsewhere
        if (ownedTeam) {
          downgradeOps.push(
            prisma.team.update({
              where: { id: ownedTeam.id },
              data: { status: "inactive", deletedAt: new Date() },
            }),
          );
          // Cascade: strip the owned team's members too
          downgradeOps.push(
            prisma.teamMember.deleteMany({
              where: { teamId: ownedTeam.id },
            }),
          );
        }
      }
    }

    const data = {};
    if (name !== undefined) data.name = String(name);
    if (email !== undefined) data.email = String(email).toLowerCase();
    if (role !== undefined) data.role = String(role);
    if (hasPro !== undefined) data.hasPro = !!hasPro;
    if (currentVersion !== undefined) {
      data.currentVersion = currentVersion;
      if (currentVersion === "free") {
        data.hasPro = false;
        data.userType = "free_user";
      }
    }
    if (adminNote !== undefined) data.adminNote = adminNote || null;
    if (proFlowLimit !== undefined)
      data.proFlowLimit = parseInt(proFlowLimit, 10);
    if (proUnlimitedFlows !== undefined)
      data.proUnlimitedFlows = !!proUnlimitedFlows;

    const ops = [
      ...(downgradeOps || []),
      prisma.user.update({
        where: { id: userId },
        data,
      }),
    ];
    await prisma.$transaction(ops);

    const updated = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        hasPro: true,
        currentVersion: true,
        adminNote: true,
        proFlowLimit: true,
        proUnlimitedFlows: true,
      },
    });

    res.json({ success: true, data: updated });
  });

  deleteUser = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { hard = false } = req.query;

    if (userId === req.user.id) {
      throw new AppError(
        "You cannot delete yourself",
        400,
        "SELF_ACTION_BLOCKED",
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        subscription: { select: { isRecurring: true, status: true } },
      },
    });
    if (!target) throw new AppError("User not found", 404, "NOT_FOUND");

    // Never hard-delete another super admin — require demotion first.
    if (target.role === "super_admin") {
      throw new AppError(
        "Cannot delete a super admin. Revoke the role first from Settings.",
        400,
        "SUPER_ADMIN_PROTECTED",
      );
    }

    // Never hard-delete a user with an active recurring Stripe subscription;
    // that would orphan Stripe billing. Must cancel via Stripe first.
    if (
      target.subscription?.isRecurring === true &&
      target.subscription?.status === "active"
    ) {
      throw new AppError(
        "User has an active Stripe subscription. Cancel it first.",
        400,
        "ACTIVE_STRIPE_SUB",
      );
    }

    if (hard === "true" || hard === true) {
      // Hard delete — cascade wipes flows, AI data, subscription, history.
      await prisma.user.delete({ where: { id: userId } });
      res.json({
        success: true,
        data: { message: "User hard-deleted (all data removed)" },
      });
    } else {
      // Soft delete — userStatus='deleted', filtered out of lists.
      await prisma.user.update({
        where: { id: userId },
        data: { userStatus: "deleted" },
      });
      res.json({
        success: true,
        data: { message: "User soft-deleted (data retained)" },
      });
    }
  });

  suspendUser = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { reason } = req.body || {};

    if (userId === req.user.id) {
      throw new AppError(
        "You cannot suspend yourself",
        400,
        "SELF_ACTION_BLOCKED",
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        suspendedAt: new Date(),
        suspendedBy: req.user.id,
        adminNote: reason || "Suspended by admin",
      },
    });

    res.json({ success: true, data: { message: "User suspended" } });
  });

  reactivateUser = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    await prisma.user.update({
      where: { id: userId },
      data: {
        suspendedAt: null,
        suspendedBy: null,
        userStatus: "success",
      },
    });

    res.json({ success: true, data: { message: "User reactivated" } });
  });

  getSubscriptions = asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 25,
      status,
      plan,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * take;

    const where = {};
    if (status) where.status = String(status);
    if (plan === "pro")
      where.productType = { in: ["pro_monthly", "pro_yearly"] };
    else if (plan === "team")
      where.productType = { in: ["team_monthly", "team_yearly"] };

    if (search) {
      where.user = {
        OR: [
          { name: { contains: String(search), mode: "insensitive" } },
          { email: { contains: String(search), mode: "insensitive" } },
        ],
      };
    }

    const allowedSortFields = new Set([
      "createdAt",
      "updatedAt",
      "expiresAt",
      "startedAt",
      "status",
    ]);
    const safeSortBy = allowedSortFields.has(String(sortBy))
      ? String(sortBy)
      : "createdAt";
    const safeSortOrder = sortOrder === "asc" ? "asc" : "desc";

    const [subscriptions, total, counts] = await Promise.all([
      prisma.subscription.findMany({
        where,
        skip,
        take,
        orderBy: { [safeSortBy]: safeSortOrder },
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
          plan: {
            select: { name: true, price: true, duration: true, tier: true },
          },
        },
      }),
      prisma.subscription.count({ where }),
      prisma.subscription.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        subscriptions,
        pagination: {
          total,
          page: pageNum,
          limit: take,
          totalPages: Math.ceil(total / take),
        },
        statusCounts: counts.reduce((acc, c) => {
          acc[c.status] = c._count.id;
          return acc;
        }, {}),
      },
    });
  });

  grantSubscription = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const {
      plan, // 'pro' | 'team'
      duration = "monthly", // 'monthly' | 'yearly'
      months, // optional override for expiry (number)
      extend = false, // if true, add time on top of current expiry instead of starting from now
      reason,
      credits, // optional override for plan credits
      appType, // 'valuechartpro' | 'valuechartteams' — optional client hint; enforced below
      seats, // for team plans
      flowLimit, // optional integer — override user.proFlowLimit (0 or -1 → unlimited)
    } = req.body || {};

    const normalizedPlan = ["pro", "team"].includes(plan) ? plan : null;
    if (!normalizedPlan) {
      throw new AppError(
        "plan must be 'pro' or 'team'",
        400,
        "VALIDATION_ERROR",
      );
    }
    const normalizedDuration = duration === "yearly" ? "yearly" : "monthly";
    const monthsToAdd =
      parseInt(months, 10) || (normalizedDuration === "yearly" ? 12 : 1);

    // Rule #3 — appType ↔ plan coupling enforced on grant
    // ValueChart Pro (individual) supports pro; ValueChart Teams (enterprise) supports team.
    // Legacy alias: 'valuechart' → 'valuechartpro'.
    if (appType) {
      const normalizedAppType =
        appType === "valuechartteams" ? "valuechartteams" : "valuechartpro";
      if (normalizedAppType === "valuechartpro" && normalizedPlan !== "pro") {
        throw new AppError(
          "ValueChart Pro app supports only Pro plans. Switch App Type to ValueChart Teams for a Team plan.",
          400,
          "APPTYPE_PLAN_MISMATCH",
        );
      }
      if (
        normalizedAppType === "valuechartteams" &&
        normalizedPlan !== "team"
      ) {
        throw new AppError(
          "ValueChart Teams app requires a Team plan.",
          400,
          "APPTYPE_PLAN_MISMATCH",
        );
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        currentVersion: true,
        subscription: { select: { expiresAt: true, status: true } },
      },
    });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");

    // Rule #1 — block duplicate active sub unless extending
    if (
      !extend &&
      user.subscription &&
      ["active", "cancelling"].includes(user.subscription.status)
    ) {
      throw new AppError(
        "User already has an active subscription. Cancel existing first, or check Extend to add time.",
        400,
        "DUPLICATE_ACTIVE_SUBSCRIPTION",
      );
    }

    // Find or create the matching Plan row
    const planName = `${normalizedPlan === "pro" ? "Pro" : "Team"} ${normalizedDuration === "yearly" ? "Yearly" : "Monthly"}`;
    let planRow = await prisma.plan.findUnique({ where: { name: planName } });
    if (!planRow) {
      planRow = await prisma.plan.create({
        data: {
          name: planName,
          duration: normalizedDuration,
          price: 0,
          status: "active",
          tier: normalizedPlan === "team" ? 2 : 1,
          appType: normalizedPlan === "team" ? "enterprise" : "individual",
          features: JSON.stringify([
            "Unlimited flows",
            "All shapes",
            "Export all formats",
            ...(normalizedPlan === "team"
              ? ["Team collaboration", "Admin dashboard", "Team management"]
              : []),
            "Priority support",
            "AI diagram generation",
          ]),
        },
      });
    }

    const now = new Date();
    // When extending, start counting from the later of (now, current expiry)
    const baseFromExtend =
      extend &&
      user.subscription?.expiresAt &&
      new Date(user.subscription.expiresAt) > now
        ? new Date(user.subscription.expiresAt)
        : now;
    const expiresAt = new Date(baseFromExtend);
    expiresAt.setMonth(expiresAt.getMonth() + monthsToAdd);

    const productType = `${normalizedPlan}_${normalizedDuration}`;
    const planCreditMap = { pro: 100, team: 300 };
    const grantCredits =
      credits !== undefined && credits !== null && credits !== ""
        ? parseInt(credits, 10)
        : planCreditMap[normalizedPlan];

    // Archive existing subscription (if any) before we overwrite it — but
    // skip when "extend" is true, because extending is a modification of
    // the SAME subscription, not a replacement.
    let archiveOp = null;
    if (!extend) {
      const existing = await prisma.subscription.findUnique({
        where: { userId },
        include: { plan: true },
      });
      archiveOp = buildArchiveSubscriptionOp(
        existing,
        existing?.status === "expired" ? "replaced_after_expiry" : "replaced",
        req.user.id,
      );
    }

    // Flow-limit override for this grant.
    //   Sentinel: flowLimit ≤ 0 → proUnlimitedFlows=true.
    //   Positive int → proFlowLimit=<int>, proUnlimitedFlows=false.
    //   undefined/null/"" → no change to flow-limit fields.
    //   Team plan with no explicit flowLimit → default to unlimited.
    let grantFlowLimitFields = null;
    if (flowLimit !== undefined && flowLimit !== null && flowLimit !== "") {
      const n = parseInt(flowLimit, 10);
      if (Number.isNaN(n)) {
        throw new AppError(
          "flowLimit must be an integer",
          400,
          "INVALID_FLOW_LIMIT",
        );
      }
      if (n <= 0) {
        grantFlowLimitFields = { proUnlimitedFlows: true };
      } else {
        grantFlowLimitFields = { proFlowLimit: n, proUnlimitedFlows: false };
      }
    } else if (normalizedPlan === "team") {
      grantFlowLimitFields = { proUnlimitedFlows: true };
    }

    // Atomic: [archive] + user + subscription + AI balance + flow migration + transaction log
    await prisma.$transaction([
      ...(archiveOp ? [archiveOp] : []),
      prisma.user.update({
        where: { id: userId },
        data: {
          hasPro: true,
          currentVersion: normalizedPlan,
          proPurchasedAt: now,
          ...(reason ? { adminNote: reason } : {}),
          ...(grantFlowLimitFields || {}),
        },
      }),
      prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          planId: planRow.id,
          status: "active",
          startedAt: now,
          expiresAt,
          price: 0,
          isRecurring: false,
          productType,
          appType: normalizedPlan === "team" ? "enterprise" : "individual",
        },
        update: {
          planId: planRow.id,
          status: "active",
          startedAt: extend ? undefined : now,
          expiresAt,
          productType,
          appType: normalizedPlan === "team" ? "enterprise" : "individual",
          deletedAt: null,
          scheduledPlanType: null,
          scheduledTeamMembers: null,
          scheduledActivationDate: null,
        },
      }),
      prisma.aiCreditBalance.upsert({
        where: { userId },
        create: {
          userId,
          planCredits: grantCredits,
          addonCredits: 0,
          planResetsAt: expiresAt,
          appContext: normalizedPlan,
        },
        update: {
          planCredits: grantCredits,
          planResetsAt: expiresAt,
          appContext: normalizedPlan,
        },
      }),
      // Migrate the user's existing non-deleted flows into the new workspace
      // so content doesn't "disappear" after an admin upgrade.
      prisma.flow.updateMany({
        where: {
          ownerId: userId,
          appContext: { not: normalizedPlan },
          deletedAt: null,
        },
        data: { appContext: normalizedPlan },
      }),
      // Financial audit entry — zero amount, type marker for admin-granted
      prisma.transactionLog.create({
        data: {
          chargeId: `admin_grant_${Date.now()}`,
          txnId: `admin_grant_${userId}_${Date.now()}`,
          amountCharged: 0,
          currency: "usd",
          status: "success",
          paymentMethod: "admin",
        },
      }),
    ]);

    // Pro/Team side effect: ensure a Team row exists with this user as owner.
    // Pro users also get a Team (default 5 seats) so they can invite members
    // from the web Teams page — mirrors the sidebar Teams entry shown after
    // a regular web Pro purchase.
    // Kept outside the main transaction because Team.teamOwnerId is unique, so
    // find+create/update avoids constraint violations on re-grant.
    {
      const isTeamPlanGrant = normalizedPlan === "team";
      const requestedSeats = isTeamPlanGrant
        ? Math.max(2, Math.min(100, parseInt(seats, 10) || 5))
        : 5; // Pro default
      const teamAppType = isTeamPlanGrant ? "enterprise" : "individual";
      const teamAppContext = normalizedPlan; // 'pro' or 'team'

      const existingTeam = await prisma.team.findFirst({
        where: { teamOwnerId: userId, deletedAt: null },
      });
      if (existingTeam) {
        await prisma.team.update({
          where: { id: existingTeam.id },
          data: {
            teamMem: requestedSeats,
            status: "active",
            appType: teamAppType,
            appContext: teamAppContext,
          },
        });
      } else {
        const newTeam = await prisma.team.create({
          data: {
            name: `${user.id}'s Team`,
            teamOwnerId: userId,
            teamMem: requestedSeats,
            countMem: 1, // owner is member #1
            appType: teamAppType,
            appContext: teamAppContext,
            status: "active",
          },
        });
        // Add owner as first TeamMember (role: OWNER).
        await prisma.teamMember.create({
          data: {
            teamId: newTeam.id,
            userId,
            role: "OWNER",
            appType: teamAppType,
          },
        });
      }
    }

    const updatedSub = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    res.json({
      success: true,
      data: {
        subscription: updatedSub,
        expiresAt,
        credits: grantCredits,
        extended: !!extend,
        message: extend
          ? `Extended ${normalizedPlan} ${normalizedDuration} — now expires ${expiresAt.toISOString().slice(0, 10)}`
          : `${normalizedPlan} ${normalizedDuration} granted until ${expiresAt.toISOString().slice(0, 10)}`,
      },
    });
  });

  cancelSubscription = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { immediate = false, reason } = req.body || {};

    if (immediate) {
      // Archive the current subscription, then atomically downgrade.
      const existing = await prisma.subscription.findUnique({
        where: { userId },
        include: { plan: true },
      });
      const archiveOp = buildArchiveSubscriptionOp(
        existing,
        "cancelled",
        req.user.id,
      );
      await prisma.$transaction([
        ...(archiveOp ? [archiveOp] : []),
        prisma.subscription.updateMany({
          where: { userId, status: { in: ["active", "cancelling"] } },
          data: { status: "cancelled", deletedAt: new Date() },
        }),
        prisma.user.update({
          where: { id: userId },
          data: {
            hasPro: false,
            currentVersion: "free",
            ...(reason ? { adminNote: reason } : {}),
          },
        }),
        prisma.aiCreditBalance.upsert({
          where: { userId },
          create: {
            userId,
            planCredits: 20,
            addonCredits: 0,
            appContext: "free",
          },
          update: { planCredits: 20, appContext: "free" },
        }),
        prisma.flow.updateMany({
          where: {
            ownerId: userId,
            appContext: { not: "free" },
            deletedAt: null,
          },
          data: { appContext: "free" },
        }),
      ]);
    } else {
      // Soft cancel — user keeps access until expiry. No DB changes to user
      // record, AI credits, or flows. Scheduled expiry handled when they
      // next sign in / we add an expiry sweep.
      await prisma.subscription.updateMany({
        where: { userId, status: "active" },
        data: { status: "cancelling" },
      });
    }

    res.json({
      success: true,
      data: {
        message: immediate
          ? "Subscription cancelled immediately — user downgraded to free"
          : "Subscription will cancel at period end",
      },
    });
  });

  // Admin-only: force a subscription to expire now. Used by the test flow
  // to simulate end-of-period without waiting. Sets expiresAt to 1 minute ago
  // but keeps status='active' — so the frontend "expired" UI kicks in.
  forceExpireSubscription = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub) throw new AppError("No subscription found", 404, "NOT_FOUND");

    const past = new Date(Date.now() - 60 * 1000);
    const existing = await prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });
    const archiveOp = buildArchiveSubscriptionOp(
      existing,
      "expired",
      req.user.id,
    );
    await prisma.$transaction([
      ...(archiveOp ? [archiveOp] : []),
      prisma.subscription.update({
        where: { userId },
        data: { status: "expired", expiresAt: past },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { hasPro: false, currentVersion: "free" },
      }),
      prisma.aiCreditBalance.upsert({
        where: { userId },
        create: {
          userId,
          planCredits: 20,
          addonCredits: 0,
          appContext: "free",
        },
        update: { planCredits: 20, appContext: "free" },
      }),
      prisma.flow.updateMany({
        where: {
          ownerId: userId,
          appContext: { not: "free" },
          deletedAt: null,
        },
        data: { appContext: "free" },
      }),
    ]);

    res.json({
      success: true,
      data: { message: "Subscription expired", expiredAt: past },
    });
  });

  adjustAiCredits = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { planCredits, addonCredits, reason } = req.body || {};

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { currentVersion: true },
    });
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");

    const updated = await prisma.aiCreditBalance.upsert({
      where: { userId },
      create: {
        userId,
        planCredits: planCredits !== undefined ? parseInt(planCredits, 10) : 0,
        addonCredits:
          addonCredits !== undefined ? parseInt(addonCredits, 10) : 0,
        appContext: user.currentVersion || "free",
      },
      update: {
        ...(planCredits !== undefined && {
          planCredits: parseInt(planCredits, 10),
        }),
        ...(addonCredits !== undefined && {
          addonCredits: parseInt(addonCredits, 10),
        }),
      },
    });

    if (reason) {
      await prisma.user.update({
        where: { id: userId },
        data: { adminNote: reason },
      });
    }

    res.json({ success: true, data: updated });
  });

  getAllUserActivity = asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 50,
      search,
      action,
      dateFrom,
      dateTo,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const take = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * take;

    const where = {};
    if (action)
      where.action = { contains: String(action), mode: "insensitive" };
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }
    if (search) {
      where.user = {
        OR: [
          { name: { contains: String(search), mode: "insensitive" } },
          { email: { contains: String(search), mode: "insensitive" } },
        ],
      };
    }

    const [actions, total] = await Promise.all([
      prisma.userAction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      }),
      prisma.userAction.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        actions,
        pagination: {
          total,
          page: pageNum,
          limit: take,
          totalPages: Math.ceil(total / take),
        },
      },
    });
  });

  exportUsersCsv = asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      where: { userStatus: { not: "deleted" } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        hasPro: true,
        currentVersion: true,
        clientType: true,
        userStatus: true,
        suspendedAt: true,
        lastSeen: true,
        createdAt: true,
        stripeCustomerId: true,
        _count: {
          select: {
            flows: { where: { deletedAt: null } },
            aiCreditUsages: true,
          },
        },
        subscription: {
          select: { productType: true, status: true, expiresAt: true },
        },
        aiCreditBalance: {
          select: { planCredits: true, addonCredits: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const esc = (v) => {
      if (v === null || v === undefined) return "";
      const s = typeof v === "string" ? v : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };

    const header = [
      "ID",
      "Name",
      "Email",
      "Role",
      "Plan",
      "Device",
      "Status",
      "Suspended",
      "Flows",
      "AI Used",
      "AI Plan Credits",
      "AI Addon Credits",
      "Subscription",
      "Sub Status",
      "Sub Expires",
      "Stripe Customer",
      "Last Seen",
      "Joined",
    ].join(",");

    const rows = users.map((u) =>
      [
        u.id,
        u.name,
        u.email,
        u.role,
        u.hasPro ? "Pro" : u.currentVersion,
        u.clientType,
        u.suspendedAt ? "suspended" : u.userStatus,
        u.suspendedAt ? u.suspendedAt.toISOString() : "",
        u._count.flows,
        u._count.aiCreditUsages,
        u.aiCreditBalance?.planCredits ?? 0,
        u.aiCreditBalance?.addonCredits ?? 0,
        u.subscription?.productType || "",
        u.subscription?.status || "",
        u.subscription?.expiresAt ? u.subscription.expiresAt.toISOString() : "",
        u.stripeCustomerId || "",
        u.lastSeen ? u.lastSeen.toISOString() : "",
        u.createdAt.toISOString(),
      ]
        .map(esc)
        .join(","),
    );

    const csv = [header, ...rows].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="valuechart-users-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  });

  getAiUsageStats = asyncHandler(async (req, res) => {
    const { dateFrom, dateTo } = req.query;
    const dateFilter = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo);
    const where = Object.keys(dateFilter).length
      ? { createdAt: dateFilter }
      : {};

    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [totalAgg, totalRequests, byModel, byFeature, dailyRaw, topUsers] =
      await Promise.all([
        prisma.aiCreditUsage.aggregate({
          _sum: { creditsUsed: true },
          where,
        }),
        prisma.aiCreditUsage.count({ where }),
        prisma.aiCreditUsage.groupBy({
          by: ["model"],
          _sum: { creditsUsed: true },
          _count: { id: true },
          where,
          orderBy: { _sum: { creditsUsed: "desc" } },
        }),
        prisma.aiCreditUsage.groupBy({
          by: ["feature"],
          _sum: { creditsUsed: true },
          _count: { id: true },
          where,
          orderBy: { _sum: { creditsUsed: "desc" } },
        }),
        prisma.$queryRaw`
        SELECT
          DATE(created_at) as date,
          COALESCE(model, 'unknown') as model,
          SUM(credits_used)::int as credits,
          COUNT(*)::int as requests
        FROM ai_credit_usages
        WHERE created_at >= ${last30}
        GROUP BY DATE(created_at), model
        ORDER BY date ASC
      `,
        prisma.aiCreditUsage.groupBy({
          by: ["userId"],
          _sum: { creditsUsed: true },
          _count: { id: true },
          where,
          orderBy: { _sum: { creditsUsed: "desc" } },
          take: 10,
        }),
      ]);

    const topIds = topUsers.map((u) => u.userId);
    const users =
      topIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: topIds } },
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              currentVersion: true,
            },
          })
        : [];
    const topUsersEnriched = topUsers.map((u) => ({
      userId: u.userId,
      credits: u._sum.creditsUsed || 0,
      requests: u._count.id,
      user: users.find((x) => x.id === u.userId) || null,
    }));

    const dailyUsage = dailyRaw.map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
      model: r.model,
      credits: Number(r.credits),
      requests: Number(r.requests),
    }));

    res.json({
      success: true,
      data: {
        summary: {
          totalCreditsUsed: totalAgg._sum.creditsUsed || 0,
          totalRequests,
          mostUsedModel: byModel[0]?.model || null,
          mostUsedFeature: byFeature[0]?.feature || null,
        },
        creditsByModel: byModel.map((m) => ({
          model: m.model || "unknown",
          credits: m._sum.creditsUsed || 0,
          requests: m._count.id,
        })),
        creditsByFeature: byFeature.map((f) => ({
          feature: f.feature,
          credits: f._sum.creditsUsed || 0,
          requests: f._count.id,
        })),
        dailyUsage,
        topUsers: topUsersEnriched,
      },
    });
  });

  testApiConnection = asyncHandler(async (req, res) => {
    const { service } = req.query;
    const start = Date.now();
    const keyEnv = {
      openai: "OPENAI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
      gemini: "GEMINI_API_KEY",
      stripe: "STRIPE_SECRET_KEY",
    }[service];
    if (!keyEnv) {
      throw new AppError(
        "service must be openai | anthropic | gemini | stripe",
        400,
        "VALIDATION_ERROR",
      );
    }
    const key = process.env[keyEnv];
    if (!key || key === "placeholder") {
      return res.json({
        success: false,
        data: {
          service,
          status: "not_configured",
          error: `${keyEnv} is not set`,
        },
      });
    }

    try {
      // Lightweight checks only — NEVER call generateContent / completions,
      // which would burn tokens on every admin click.
      if (service === "openai") {
        const OpenAI = require("openai");
        const client = new OpenAI({ apiKey: key });
        await client.models.list();
      } else if (service === "anthropic") {
        // Anthropic SDK: list models (no token cost)
        const Anthropic = require("@anthropic-ai/sdk");
        const client = new Anthropic({ apiKey: key });
        await client.models.list();
      } else if (service === "gemini") {
        // Gemini "listModels" REST endpoint — free
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
        );
        if (!r.ok) {
          const text = await r.text();
          throw new Error(
            `Gemini listModels ${r.status}: ${text.slice(0, 200)}`,
          );
        }
      } else if (service === "stripe") {
        const stripe = require("stripe")(key);
        await stripe.balance.retrieve();
      }

      res.json({
        success: true,
        data: {
          service,
          status: "connected",
          responseTime: Date.now() - start,
        },
      });
    } catch (err) {
      res.json({
        success: false,
        data: {
          service,
          status: "failed",
          responseTime: Date.now() - start,
          error: String(err?.message || err).slice(0, 400),
        },
      });
    }
  });

  getSettings = asyncHandler(async (req, res) => {
    const [planRows, superAdmins] = await Promise.all([
      prisma.plan.findMany({
        where: { status: "active" },
        select: {
          id: true,
          name: true,
          duration: true,
          price: true,
          tier: true,
        },
        orderBy: [{ tier: "asc" }, { duration: "asc" }],
      }),
      prisma.user.findMany({
        where: { role: "super_admin" },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
          lastSeen: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const apiKeys = {
      openai: !!process.env.OPENAI_API_KEY,
      anthropic:
        !!process.env.ANTHROPIC_API_KEY &&
        process.env.ANTHROPIC_API_KEY !== "placeholder",
      gemini: !!process.env.GEMINI_API_KEY,
      stripe: !!process.env.STRIPE_SECRET_KEY,
    };

    res.json({
      success: true,
      data: {
        plans: planRows,
        superAdmins,
        apiKeys,
        // Plan credits and flow limits are currently enforced in code — expose
        // the defaults so the UI can display them even if not editable.
        aiCreditDefaults: { free: 20, pro: 100, team: 300 },
        flowLimitDefaults: {
          free: 10,
          pro: "configurable per user (proFlowLimit / proUnlimitedFlows)",
        },
      },
    });
  });

  addSuperAdmin = asyncHandler(async (req, res) => {
    const { userId } = req.body || {};
    if (!userId) {
      throw new AppError("userId is required", 400, "VALIDATION_ERROR");
    }
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!target) throw new AppError("User not found", 404, "NOT_FOUND");
    if (target.role === "super_admin") {
      return res.json({
        success: true,
        data: { message: "User is already a super admin" },
      });
    }
    await prisma.user.update({
      where: { id: userId },
      data: { role: "super_admin" },
    });
    res.json({
      success: true,
      data: { message: "Super admin role granted" },
    });
  });

  removeSuperAdmin = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    if (userId === req.user.id) {
      throw new AppError(
        "You cannot remove your own super_admin role",
        400,
        "SELF_DEMOTION_BLOCKED",
      );
    }
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!target) throw new AppError("User not found", 404, "NOT_FOUND");

    // Safety: never leave zero super admins
    const count = await prisma.user.count({ where: { role: "super_admin" } });
    if (count <= 1 && target.role === "super_admin") {
      throw new AppError(
        "Cannot remove the last remaining super admin",
        400,
        "LAST_SUPER_ADMIN",
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: { role: "Viewer" },
    });
    res.json({
      success: true,
      data: { message: "Super admin role revoked" },
    });
  });

  getAdminLogs = asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 50,
      adminId,
      action,
      dateFrom,
      dateTo,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const take = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * take;

    const where = {};
    if (adminId) where.adminId = String(adminId);
    if (action)
      where.action = { contains: String(action), mode: "insensitive" };
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [logs, total] = await Promise.all([
      prisma.adminLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          admin: { select: { id: true, name: true, email: true, image: true } },
          targetUser: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      }),
      prisma.adminLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page: pageNum,
          limit: take,
          totalPages: Math.ceil(total / take),
        },
      },
    });
  });

  searchUsers = asyncHandler(async (req, res) => {
    const { q } = req.query;
    if (!q || String(q).trim().length < 2) {
      return res.json({ success: true, data: [] });
    }
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: String(q), mode: "insensitive" } },
          { email: { contains: String(q), mode: "insensitive" } },
        ],
        userStatus: { not: "deleted" },
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        currentVersion: true,
        hasPro: true,
      },
      take: 10,
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: users });
  });

  // ============================================================
  // TEAM MANAGEMENT (super-admin view)
  // Applies to the target user's owned team. Members are always
  // ValueChart (individual) free users who get inherited access.
  // ============================================================

  getUserTeam = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const team = await prisma.team.findFirst({
      where: { teamOwnerId: userId, deletedAt: null },
      include: {
        owner: {
          select: { id: true, name: true, email: true, image: true },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                userStatus: true,
                suspendedAt: true,
                lastSeen: true,
                currentVersion: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!team) {
      return res.json({ success: true, data: { team: null } });
    }

    res.json({
      success: true,
      data: {
        team: {
          id: team.id,
          name: team.name,
          ownerId: team.teamOwnerId,
          owner: team.owner,
          maxMembers: team.teamMem,
          memberCount: team.members.length,
          seatsUsed: team.members.length,
          seatsAvailable: Math.max(0, team.teamMem - team.members.length),
          members: team.members.map((m) => ({
            id: m.id,
            userId: m.userId,
            role: m.role,
            joinedAt: m.createdAt,
            user: m.user,
          })),
          createdAt: team.createdAt,
        },
      },
    });
  });

  addTeamMember = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { memberUserId, email, role = "MEMBER" } = req.body || {};

    if (!memberUserId && !email) {
      throw new AppError(
        "Provide memberUserId or email",
        400,
        "VALIDATION_ERROR",
      );
    }

    const team = await prisma.team.findFirst({
      where: { teamOwnerId: userId, deletedAt: null, status: "active" },
      include: { _count: { select: { members: true } } },
    });
    if (!team) {
      throw new AppError(
        "This user does not own an active team",
        404,
        "TEAM_NOT_FOUND",
      );
    }

    if (team._count.members >= team.teamMem) {
      throw new AppError(
        `Seat limit reached (${team.teamMem}). Upgrade the team plan to add more.`,
        400,
        "SEAT_LIMIT_REACHED",
      );
    }

    let memberUser;
    if (memberUserId) {
      memberUser = await prisma.user.findUnique({
        where: { id: memberUserId },
        select: { id: true, email: true, name: true, userStatus: true },
      });
    } else {
      memberUser = await prisma.user.findUnique({
        where: { email: String(email).toLowerCase() },
        select: { id: true, email: true, name: true, userStatus: true },
      });
    }

    if (!memberUser) {
      throw new AppError(
        "User not found. Create the user first, then add them to the team.",
        404,
        "USER_NOT_FOUND",
      );
    }

    if (memberUser.id === team.teamOwnerId) {
      throw new AppError(
        "The team owner cannot be added as a member",
        400,
        "OWNER_NOT_ADDABLE",
      );
    }

    // Reject if already a member
    const existing = await prisma.teamMember.findFirst({
      where: { teamId: team.id, userId: memberUser.id },
    });
    if (existing) {
      throw new AppError(
        "User is already a member of this team",
        400,
        "ALREADY_MEMBER",
      );
    }

    const member = await prisma.teamMember.create({
      data: {
        teamId: team.id,
        userId: memberUser.id,
        role: String(role).toUpperCase(),
        appType: "enterprise",
      },
    });
    await prisma.team.update({
      where: { id: team.id },
      data: { countMem: team._count.members + 1 },
    });

    res.status(201).json({ success: true, data: { member } });
  });

  removeTeamMember = asyncHandler(async (req, res) => {
    const { userId, memberId } = req.params;

    const team = await prisma.team.findFirst({
      where: { teamOwnerId: userId, deletedAt: null },
      include: { _count: { select: { members: true } } },
    });
    if (!team) {
      throw new AppError("Team not found", 404, "TEAM_NOT_FOUND");
    }

    const member = await prisma.teamMember.findUnique({
      where: { id: memberId },
    });
    if (!member || member.teamId !== team.id) {
      throw new AppError("Member not found in this team", 404, "NOT_FOUND");
    }

    await prisma.teamMember.delete({ where: { id: memberId } });
    await prisma.team.update({
      where: { id: team.id },
      data: { countMem: Math.max(0, team._count.members - 1) },
    });

    res.json({ success: true, data: { message: "Member removed" } });
  });

  resetUserPassword = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { newPassword } = req.body || {};

    if (!newPassword || String(newPassword).length < 8) {
      throw new AppError(
        "Password must be at least 8 characters",
        400,
        "VALIDATION_ERROR",
      );
    }

    const hashed = await argon2.hash(String(newPassword));
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    res.json({
      success: true,
      data: { message: "Password reset successfully" },
    });
  });

  processRefund = asyncHandler(async (req, res) => {
    const { chargeId, amount, reason } = req.body;
    if (!chargeId) {
      throw new AppError("chargeId is required", 400, "MISSING_CHARGE_ID");
    }

    const stripe = getStripe();
    const refund = await stripe.refunds.create({
      charge: chargeId,
      ...(amount ? { amount: Math.round(Number(amount) * 100) } : {}),
      reason: reason || "requested_by_customer",
      metadata: {
        processedBy: req.user.id,
        processedAt: new Date().toISOString(),
      },
    });

    res.json({
      success: true,
      data: {
        refundId: refund.id,
        status: refund.status,
        amount: refund.amount / 100,
        currency: refund.currency,
      },
    });
  });

  broadcastNotification = asyncHandler(async (req, res) => {
    const { title, body, url, kind } = req.body || {};
    if (!title || !body) {
      throw new AppError(
        "title and body are required",
        400,
        "VALIDATION_ERROR",
      );
    }
    const data = {};
    if (url) data.url = url;
    if (kind) data.kind = kind;
    const result = await fcmService.broadcastToAll(title, body, data);
    res.json({ success: true, data: result });
  });

  countDevices = asyncHandler(async (req, res) => {
    const total = await prisma.firebaseUser.count({
      where: { fcmToken: { not: null }, deletedAt: null },
    });
    res.json({ success: true, data: { total } });
  });
}

module.exports = new SuperAdminController();
