// ============================================================
// DATA MIGRATION SCRIPT
// MySQL (3 databases) → PostgreSQL (1 unified database)
//
// Prerequisites:
//   npm install mysql2 @prisma/client dotenv
//   npx prisma generate
//   npx prisma db push (or npx prisma migrate dev)
//
// Usage:
//   node migrate-data.js
//
// Env vars needed in .env:
//   DATABASE_URL="postgresql://user:pass@host:5432/value_chart"
//   MYSQL_VS_HOST=127.0.0.1
//   MYSQL_VS_USER=root
//   MYSQL_VS_PASS=
//   MYSQL_VS_DB=value_stream
//   MYSQL_ENT_DB=ent_value_chart
//   MYSQL_IND_DB=ind_value_chart
// ============================================================

require("dotenv").config();
const mysql = require("mysql2/promise");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// ---- MySQL connection pools ----
function createPool(dbName) {
    return mysql.createPool({
        host: process.env.MYSQL_VS_HOST || "127.0.0.1",
        user: process.env.MYSQL_VS_USER || "root",
        password: process.env.MYSQL_VS_PASS || "",
        database: dbName,
        waitForConnections: true,
        connectionLimit: 5,
    });
}

let vsPool, entPool, indPool;

// ---- Helper: query MySQL ----
async function query(pool, sql, params = []) {
    const [rows] = await pool.execute(sql, params);
    return rows;
}

// ---- ID mapping stores ----
// Maps legacy INT ids → new cuid() STRING ids
const userIdMap = new Map();   // legacyVsId → new userId
const roleIdMap = new Map();   // legacy role id → new role id
const appIdMap = new Map();    // legacy app id → new app id
const planIdMap = new Map();   // legacy plan id + source → new plan id
const teamIdMap = new Map();   // legacy team id → new team id
const flowIdMap = new Map();   // legacy flow id + source → new flow id
const groupIdMap = new Map();  // legacy group id + source → new group id
const chatGroupIdMap = new Map();
const chatMsgIdMap = new Map();
const subIdMap = new Map();
const convIdMap = new Map();
const msgIdMap = new Map();

function mapKey(id, source) {
    return `${source}:${id}`;
}

// ---- Convert MySQL enum to boolean ----
function enumToBool(val) {
    if (val === "yes" || val === "1" || val === 1 || val === true) return true;
    return false;
}

// ---- Main migration functions ----

async function migrateRoles() {
    console.log("📦 Migrating roles...");
    const roles = await query(vsPool, "SELECT * FROM roles");
    for (const r of roles) {
        const created = await prisma.role.create({
            data: {
                legacyId: r.id,
                title: r.title,
                createdAt: r.created_at || new Date(),
                updatedAt: r.updated_at || new Date(),
            },
        });
        roleIdMap.set(r.id, created.id);
    }
    console.log(`  ✅ ${roles.length} roles migrated`);
}

async function migrateUsers() {
    console.log("📦 Migrating users from value_stream...");
    const users = await query(vsPool, "SELECT * FROM users");

    for (const u of users) {
        // Check if user exists in ent_value_chart
        const [entUser] = await query(
            entPool,
            "SELECT * FROM users WHERE email = ? LIMIT 1",
            [u.email]
        );
        // Check if user exists in ind_value_chart
        const [indUser] = await query(
            indPool,
            "SELECT * FROM users WHERE email = ? LIMIT 1",
            [u.email]
        );

        const created = await prisma.user.create({
            data: {
                legacyVsId: u.id,
                legacyEntId: entUser ? entUser.id : null,
                legacyIndId: indUser ? indUser.id : null,
                name: u.name,
                email: u.email,
                password: u.password,
                rememberToken: u.remember_token,
                contactNo: u.contact_no,
                photo: u.photo,
                // login_type from ent (has it), or default
                // NextAuth handles OAuth now, but keep for reference
                clientType: (entUser?.client || u.client || "web"),
                userStatus: (u.status || "success"),
                roleId: u.role_id ? roleIdMap.get(u.role_id) || null : null,
                userType: u.user_type || "free_user",
                welcomeUser: enumToBool(u.welcome_user),
                companyId: indUser?.company_id || null,
                pFlowRead: enumToBool(u.p_flow_read),
                pFlowModify: enumToBool(u.p_flow_modify),
                pUserRead: enumToBool(u.p_user_read),
                pUserModify: enumToBool(u.p_user_modify),
                pShapeRead: enumToBool(u.p_shape_read),
                pShapeModify: enumToBool(u.p_shape_modify),
                chatEnabled: entUser ? enumToBool(entUser.chat) : false,
                createdAt: u.created_at || new Date(),
            },
        });

        userIdMap.set(u.id, created.id);
    }
    console.log(`  ✅ ${users.length} users migrated`);
}

async function migrateApps() {
    console.log("📦 Migrating apps...");
    const apps = await query(vsPool, "SELECT * FROM apps");
    for (const a of apps) {
        const created = await prisma.app.create({
            data: {
                legacyId: a.id,
                appName: a.app_name,
                dbName: a.db_name,
                createdAt: a.created_at,
            },
        });
        appIdMap.set(a.id, created.id);
    }
    console.log(`  ✅ ${apps.length} apps migrated`);
}

async function migrateUsersApp() {
    console.log("📦 Migrating user-app mappings...");
    const rows = await query(vsPool, "SELECT * FROM users_app");
    let count = 0;
    for (const r of rows) {
        const userId = userIdMap.get(r.user_id);
        const appId = appIdMap.get(r.app_id);
        if (!userId || !appId) continue;
        await prisma.userApp.create({
            data: { userId, appId, createdAt: r.created_at },
        });
        count++;
    }
    console.log(`  ✅ ${count} user-app mappings migrated`);
}

async function migrateFirebaseUsers() {
    console.log("📦 Migrating firebase users...");
    const rows = await query(vsPool, "SELECT * FROM firebase_user");
    let count = 0;
    for (const r of rows) {
        const userId = userIdMap.get(r.user_id);
        if (!userId) continue;
        // Check if firebase user already exists for this user
        const existing = await prisma.firebaseUser.findUnique({ where: { userId } });
        if (existing) continue;
        await prisma.firebaseUser.create({
            data: {
                userId,
                fcmUsername: r.fcm_username,
                fcmPassword: r.fcm_password,
                fcmUserId: r.fcm_user_id,
                fcmToken: r.fcm_token,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
                deletedAt: r.deleted_at,
            },
        });
        count++;
    }
    console.log(`  ✅ ${count} firebase users migrated`);
}

async function migratePlans() {
    console.log("📦 Migrating plans...");

    // 1. Plans from value_stream (master - enterprise plans)
    const vsPlans = await query(vsPool, "SELECT * FROM plan");
    for (const p of vsPlans) {
        const key = mapKey(p.id, "value_stream");
        // Parse JSON strings safely
        let permAccess = null, benefits = null, subPlanId = null;
        try { permAccess = JSON.parse(p.permission_access); } catch { }
        try { benefits = JSON.parse(p.benefits); } catch { }
        try { subPlanId = JSON.parse(p.sub_plan_id); } catch { }

        const created = await prisma.plan.create({
            data: {
                legacyId: p.id,
                legacySource: "value_stream",
                name: `${p.plan_name}_${p.duration}_vs_${p.id}`, // Unique name
                duration: p.duration || "monthly",
                noDuration: p.no_duration,
                price: p.cost || 0,
                freeTrial: p.free_trail || 0,
                gracePeriod: p.grace_period || 0,
                userAccess: enumToBool(p.user_access),
                userCount: p.user_count,
                userCost: p.user_cost,
                status: p.status || "active",
                permissionAccess: permAccess,
                features: benefits,
                tier: 0,
                colorPick: p.color_pick,
                fontname: p.fontname,
                subPlanId: subPlanId,
                subTopId: p.sub_top_id,
                appType: "enterprise",
                createdAt: p.created_at,
                deletedAt: p.deleted_at,
            },
        });
        planIdMap.set(key, created.id);
    }

    // 2. Plans from ind_value_chart (simpler structure)
    const indPlans = await query(indPool, "SELECT * FROM plan");
    for (const p of indPlans) {
        const key = mapKey(p.id, "ind_value_chart");
        let benefits = null;
        try { benefits = JSON.parse(p.benefits); } catch { }

        const created = await prisma.plan.create({
            data: {
                legacyId: p.id,
                legacySource: "ind_value_chart",
                name: `${p.plan_name}_${p.duration}_ind_${p.id}`,
                duration: p.duration || "monthly",
                noDuration: p.no_duration,
                price: p.cost || 0,
                status: p.status || "active",
                features: benefits,
                tier: 0,
                appType: "individual",
                createdAt: p.created_at,
                deletedAt: p.deleted_at,
            },
        });
        planIdMap.set(key, created.id);
    }

    console.log(`  ✅ ${vsPlans.length + indPlans.length} plans migrated`);
}

async function migrateSubscriptions() {
    console.log("📦 Migrating subscriptions...");
    const rows = await query(vsPool, "SELECT * FROM subscription");
    let count = 0;
    for (const s of rows) {
        const userId = userIdMap.get(s.user_id);
        if (!userId) continue;

        // Find the matching plan
        const planKey = mapKey(s.plan_id, "value_stream");
        const planId = planIdMap.get(planKey);
        if (!planId) continue;

        // Check if user already has a subscription
        const existing = await prisma.subscription.findUnique({ where: { userId } });
        if (existing) continue; // Keep first (most recent active) subscription

        let perm = null;
        try { perm = JSON.parse(s.permission); } catch { }

        const created = await prisma.subscription.create({
            data: {
                legacyId: s.id,
                legacySource: "value_stream",
                userId,
                planId,
                paymentId: s.payment_id,
                price: s.price || 0,
                currency: s.currency,
                permission: perm,
                isRecurring: enumToBool(s.is_recurring),
                deviceType: s.device_type || "web",
                appType: s.app_type || null,
                usersCount: s.users_count,
                flowsCount: s.flows_count,
                subType: s.sub_type || null,
                productType: s.product_type || null,
                paidApp: enumToBool(s.paid_app),
                freeTrial: s.free_trail,
                gracePeriod: s.grace_period,
                startedAt: s.started_at,
                expiresAt: s.plan_endat,
                status: s.status || "active",
                createdAt: s.created_at,
                deletedAt: s.deleted_at,
            },
        });
        subIdMap.set(s.id, created.id);
        count++;
    }
    console.log(`  ✅ ${count} subscriptions migrated`);
}

async function migrateTeams() {
    console.log("📦 Migrating teams...");
    const rows = await query(vsPool, "SELECT * FROM usersteam");
    for (const t of rows) {
        const ownerId = userIdMap.get(t.team_owner_id);
        if (!ownerId) continue;
        const created = await prisma.team.create({
            data: {
                legacyId: t.id,
                teamOwnerId: ownerId,
                teamMem: t.team_mem || 0,
                countMem: t.count_mem || 0,
                appType: t.app_type || null,
                verifyTeam: t.verify_team,
                status: t.status || "active",
                createdAt: t.created_at,
                deletedAt: t.deleted_at,
            },
        });
        teamIdMap.set(t.id, created.id);
    }

    // Team members
    const members = await query(vsPool, "SELECT * FROM team_members");
    let mCount = 0;
    for (const m of members) {
        const userId = userIdMap.get(m.user_id);
        const teamId = teamIdMap.get(m.team_id);
        if (!userId || !teamId) continue;
        await prisma.teamMember.create({
            data: {
                userId,
                teamId,
                appType: m.app_type || null,
                createdAt: m.created_at,
            },
        });
        mCount++;
    }
    console.log(`  ✅ ${rows.length} teams, ${mCount} members migrated`);
}

async function migrateFlows(pool, source, appType) {
    console.log(`📦 Migrating flows from ${source}...`);
    const rows = await query(pool, "SELECT * FROM flows");
    let count = 0;
    for (const f of rows) {
        const ownerId = userIdMap.get(f.created_by_id);
        if (!ownerId) continue;
        const created = await prisma.flow.create({
            data: {
                legacyId: f.id,
                legacySource: source,
                name: f.flow_name || "Untitled Flow",
                diagramData: f.flow_data || "",
                thumbnail: f.flow_image,
                ownerId,
                appType,
                createdAt: f.created_at || new Date(),
                deletedAt: f.deleted_at,
            },
        });
        flowIdMap.set(mapKey(f.id, source), created.id);
        count++;
    }
    console.log(`  ✅ ${count} flows migrated from ${source}`);
}

async function migrateGroups(pool, source, appType) {
    console.log(`📦 Migrating shape groups from ${source}...`);
    const rows = await query(pool, "SELECT * FROM `groups`");
    let count = 0;
    for (const g of rows) {
        const userId = userIdMap.get(g.created_by_id);
        if (!userId) continue;
        const created = await prisma.shapeGroup.create({
            data: {
                legacyId: g.id,
                legacySource: source,
                name: g.name || "Untitled Group",
                userId,
                isPredefined: enumToBool(g.is_predefined),
                teamId: g.team_id || 0,
                appType,
                createdAt: g.created_at || new Date(),
                deletedAt: g.deleted_at,
            },
        });
        groupIdMap.set(mapKey(g.id, source), created.id);
        count++;
    }
    console.log(`  ✅ ${count} shape groups migrated from ${source}`);
}

async function migrateShapes(pool, source, appType) {
    console.log(`📦 Migrating shapes from ${source}...`);
    const rows = await query(pool, "SELECT * FROM shapes");
    let count = 0;
    for (const s of rows) {
        const groupId = s.group_id ? groupIdMap.get(mapKey(s.group_id, source)) : null;
        // shapes need an owner - try to find from group, or use first admin
        const group = groupId
            ? await prisma.shapeGroup.findUnique({ where: { id: groupId } })
            : null;
        const ownerId = group?.userId || userIdMap.values().next().value;
        if (!ownerId) continue;

        await prisma.shape.create({
            data: {
                legacyId: s.id,
                legacySource: source,
                name: s.name || "Untitled Shape",
                type: s.shape_type || "stencil",
                content: s.shape,
                textAlignment: s.text_alignment || "bottom",
                ratioLock: s.ratio_lock !== undefined ? enumToBool(s.ratio_lock) : true,
                shapeType: s.shape_type || "img",
                groupId,
                ownerId,
                appType,
                createdAt: s.created_at || new Date(),
                deletedAt: s.deleted_at,
            },
        });
        count++;
    }
    console.log(`  ✅ ${count} shapes migrated from ${source}`);
}

async function migrateFlowLimits(pool, source, appType) {
    console.log(`📦 Migrating flow limits from ${source}...`);
    const rows = await query(pool, "SELECT * FROM flow_limit");
    let count = 0;
    for (const fl of rows) {
        const userId = userIdMap.get(fl.user_id);
        if (!userId) continue;
        await prisma.flowLimit.create({
            data: {
                legacyId: fl.id,
                legacySource: source,
                userId,
                totCount: fl.tot_count,
                flowUsed: fl.flow_used,
                flowIds: fl.flow_ids,
                appType,
                createdAt: fl.created_at,
            },
        });
        count++;
    }
    console.log(`  ✅ ${count} flow limits migrated from ${source}`);
}

async function migrateTransactionLogs() {
    console.log("📦 Migrating transaction logs...");
    const rows = await query(vsPool, "SELECT * FROM transaction_log");
    for (const t of rows) {
        await prisma.transactionLog.create({
            data: {
                legacyId: t.id,
                legacySource: "value_stream",
                chargeId: t.charge_id,
                txnId: t.txn_id,
                amountCharged: t.amount_charged,
                paymentMethod: t.payment_method,
                holderName: t.holder_name,
                currency: t.currency,
                status: t.status,
                createdAt: t.created_at,
                deletedAt: t.deleted_at,
            },
        });
    }
    console.log(`  ✅ ${rows.length} transaction logs migrated`);
}

async function migrateUserActions() {
    console.log("📦 Migrating user actions...");
    const rows = await query(vsPool, "SELECT * FROM user_actions");
    let count = 0;
    for (const a of rows) {
        const userId = userIdMap.get(a.user_id);
        if (!userId) continue;
        await prisma.userAction.create({
            data: {
                action: a.action,
                actionModel: a.action_model,
                actionId: a.action_id,
                userId,
                createdAt: a.created_at,
            },
        });
        count++;
    }
    console.log(`  ✅ ${count} user actions migrated`);
}

// ============================================================
// MAIN EXECUTION
// ============================================================

async function main() {
    console.log("🚀 Starting migration: MySQL → PostgreSQL\n");
    console.log("=".repeat(50));

    // Initialize MySQL pools
    vsPool = createPool(process.env.MYSQL_VS_DB || "value_stream");
    entPool = createPool(process.env.MYSQL_ENT_DB || "ent_value_chart");
    indPool = createPool(process.env.MYSQL_IND_DB || "ind_value_chart");

    try {
        // Phase 1: Foundation tables
        await migrateRoles();
        await migrateUsers();
        await migrateApps();
        await migrateUsersApp();
        await migrateFirebaseUsers();

        // Phase 2: Plans & billing
        await migratePlans();
        await migrateSubscriptions();
        await migrateTeams();

        // Phase 3: App data - Enterprise
        await migrateFlows(entPool, "ent_value_chart", "enterprise");
        await migrateGroups(entPool, "ent_value_chart", "enterprise");
        await migrateShapes(entPool, "ent_value_chart", "enterprise");
        await migrateFlowLimits(entPool, "ent_value_chart", "enterprise");

        // Phase 4: App data - Individual
        await migrateFlows(indPool, "ind_value_chart", "individual");
        await migrateGroups(indPool, "ind_value_chart", "individual");
        await migrateShapes(indPool, "ind_value_chart", "individual");
        await migrateFlowLimits(indPool, "ind_value_chart", "individual");

        // Phase 5: Auxiliary data
        await migrateTransactionLogs();
        await migrateUserActions();

        console.log("\n" + "=".repeat(50));
        console.log("🎉 Migration complete!");
        console.log(`  Users:  ${userIdMap.size}`);
        console.log(`  Flows:  ${flowIdMap.size}`);
        console.log(`  Groups: ${groupIdMap.size}`);
        console.log(`  Plans:  ${planIdMap.size}`);
        console.log(`  Teams:  ${teamIdMap.size}`);
    } catch (err) {
        console.error("❌ Migration failed:", err);
        throw err;
    } finally {
        await vsPool.end();
        await entPool.end();
        await indPool.end();
        await prisma.$disconnect();
    }
}

main().catch(console.error);

// Available migration commands now

//   npm run prisma:push      # Create PostgreSQL tables
//   npm run migrate          # Run MySQL → PostgreSQL ETL
//   npm run full - migrate     # Both in sequence