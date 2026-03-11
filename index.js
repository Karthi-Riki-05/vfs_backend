const express = require('express');
const http = require('http');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const swaggerUi = require('swagger-ui-express');
require('dotenv').config();

const { initSocketIO, getIO } = require('./src/socket');

const logger = require('./src/utils/logger');
const AppError = require('./src/utils/AppError');
const asyncHandler = require('./src/utils/asyncHandler');
const securityMiddleware = require('./src/middleware/security');
const { globalLimiter, aiLimiter } = require('./src/middleware/rateLimiter');
const errorHandler = require('./src/middleware/errorHandler');
const requestLogger = require('./src/middleware/requestLogger');
const timeout = require('./src/middleware/timeout');
const { authenticate } = require('./src/middleware/auth.middleware');
const validate = require('./src/middleware/validate');
const { generateDiagramSchema } = require('./src/validators/ai.validator');
const swaggerSpec = require('./src/config/swagger');

// Routes
const authRoutes = require('./src/routes/auth.routes');
const flowRoutes = require('./src/routes/flow.routes');
const shapeRoutes = require('./src/routes/shape.routes');
const shapeGroupRoutes = require('./src/routes/shapeGroup.routes');
const subscriptionRoutes = require('./src/routes/subscription.routes');
const openaiRoutes = require('./src/routes/openai.routes');
const userRoutes = require('./src/routes/user.routes');
const teamRoutes = require('./src/routes/team.routes');
const chatRoutes = require('./src/routes/chat.routes');
const issueRoutes = require('./src/routes/issue.routes');
const paymentRoutes = require('./src/routes/payment.routes');
const adminRoutes = require('./src/routes/admin.routes');
const cronRoutes = require('./src/routes/cron.routes');
const projectRoutes = require('./src/routes/project.routes');
const proRoutes = require('./src/routes/pro.routes');
const inviteRoutes = require('./src/routes/invite.routes');
const aiAssistantRoutes = require('./src/routes/ai-assistant.routes');

// Validate required env vars at startup
const requiredEnvVars = ['NEXTAUTH_SECRET'];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        logger.error(`Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}

const app = express();

// Security middleware (helmet, hpp, x-powered-by)
securityMiddleware(app);

// CORS with strict whitelist
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3000'];
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (server-to-server, curl, etc.)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new AppError('Not allowed by CORS', 403, 'CORS_ERROR'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Stripe webhook routes MUST receive raw body — mount BEFORE express.json()
const webhookRawBody = express.raw({ type: 'application/json' });
const captureRawBody = (req, res, next) => {
    req.rawBody = req.body; // body is a raw Buffer here (from express.raw)
    next();
};
app.use('/api/v1/payments/webhook', webhookRawBody, captureRawBody);
app.use('/api/payments/webhook', webhookRawBody, captureRawBody);
app.use('/api/v1/subscription/webhook', webhookRawBody, captureRawBody);
app.use('/api/subscription/webhook', webhookRawBody, captureRawBody);

// Body parser with size limits (AFTER webhook raw body routes)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Request ID tracking
app.use((req, res, next) => {
    const crypto = require('crypto');
    req.headers['x-request-id'] = req.headers['x-request-id'] || crypto.randomUUID();
    res.setHeader('x-request-id', req.headers['x-request-id']);
    next();
});

// Request logging
app.use(requestLogger);

// Request timeout (30 seconds)
app.use(timeout(30000));

// Global rate limiter
app.use(globalLimiter);

// Serve uploaded files
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// View engine
app.set('view engine', 'ejs');

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customSiteTitle: 'Value Charts API Docs',
}));
app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
});

// Status Page
app.get('/', (req, res) => {
    res.render('index', { version: '2.0.0' });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// API v1 Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/flows', flowRoutes);
app.use('/api/v1/shapes', shapeRoutes);
app.use('/api/v1/shape-groups', shapeGroupRoutes);
app.use('/api/v1/subscription', subscriptionRoutes);
app.use('/api/v1/openai', openaiRoutes);
app.use('/api/v1/teams', teamRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/issues', issueRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/cron', cronRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/invite', inviteRoutes);
app.use('/api/v1/upgrade-pro', proRoutes);
app.use('/api/v1/pro', proRoutes); // backward-compatible alias
app.use('/api/v1/ai-assistant', aiAssistantRoutes);

// Backwards-compatible aliases (old /api/ routes -> /api/v1/)
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/flows', flowRoutes);
app.use('/api/shapes', shapeRoutes);
app.use('/api/shape-groups', shapeGroupRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/openai', openaiRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/invite', inviteRoutes);
app.use('/api/upgrade-pro', proRoutes);
app.use('/api/pro', proRoutes); // backward-compatible alias
app.use('/api/ai-assistant', aiAssistantRoutes);

// AI Generate Diagram (Gemini) — now protected
const genAI = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

/**
 * @swagger
 * /api/v1/ai/generate-diagram:
 *   post:
 *     summary: Generate a diagram from a text description using AI
 *     tags: [AI]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [prompt]
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: Business process description
 *                 example: User registration flow with email verification
 *     responses:
 *       200:
 *         description: Generated diagram data
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: AI processing failed
 */
function parseAISuggestion(text) {
    try {
        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/{[\s\S]*}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[1] || jsonMatch[0]);
        }
        return { error: 'Could not find valid JSON in AI response', raw: text };
    } catch (e) {
        return { error: 'Failed to parse AI response as JSON', raw: text };
    }
}

app.post('/api/v1/ai/generate-diagram', authenticate, aiLimiter, validate(generateDiagramSchema), asyncHandler(async (req, res) => {
    const { prompt } = req.body;

    if (!genAI) {
        throw new AppError('Gemini API key not configured', 500, 'GEMINI_NOT_CONFIGURED');
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const systemInstruction = `
        You are a system architect. Convert business process descriptions into a structured flowchart JSON.
        The JSON should have an array of 'nodes' (id, label, type) and 'edges' (id, source, target, label).
        Return ONLY the JSON.
    `;

    const fullPrompt = `${systemInstruction}\n\nDescription: ${prompt}`;
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();
    const diagramData = parseAISuggestion(text);

    res.json({ success: true, data: { diagramCode: text, structuredData: diagramData } });
}));

// Backwards-compatible alias for the old route
app.post('/api/ai/generate-diagram', authenticate, aiLimiter, validate(generateDiagramSchema), asyncHandler(async (req, res) => {
    const { prompt } = req.body;

    if (!genAI) {
        throw new AppError('Gemini API key not configured', 500, 'GEMINI_NOT_CONFIGURED');
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const systemInstruction = `
        You are a system architect. Convert business process descriptions into a structured flowchart JSON.
        The JSON should have an array of 'nodes' (id, label, type) and 'edges' (id, source, target, label).
        Return ONLY the JSON.
    `;

    const fullPrompt = `${systemInstruction}\n\nDescription: ${prompt}`;
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();
    const diagramData = parseAISuggestion(text);

    res.json({ success: true, data: { diagramCode: text, structuredData: diagramData } });
}));

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found` },
    });
});

// Global error handler (must be last)
app.use(errorHandler);

// Unhandled rejection handler
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

// Create HTTP server (used by both Express and Socket.IO)
const server = http.createServer(app);

// Initialize Socket.IO (attached to the same HTTP server)
const socketAllowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3000'];
initSocketIO(server, socketAllowedOrigins);

// Auto-seed essential data if missing (roles, plans, apps)
async function autoSeed() {
    const { prisma } = require('./src/lib/prisma');
    try {
        const roleCount = await prisma.role.count();
        if (roleCount === 0) {
            logger.info('No seed data found. Running auto-seed...');
            const roles = [
                { title: 'Super Admin', legacyId: 1 },
                { title: 'Company Admin', legacyId: 2 },
                { title: 'Process Manager', legacyId: 3 },
                { title: 'User', legacyId: 4 },
                { title: 'Free user', legacyId: 5 },
            ];
            for (const role of roles) {
                await prisma.role.upsert({ where: { legacyId: role.legacyId }, update: { title: role.title }, create: role });
            }

            const apps = [
                { appName: 'valuechart_enterprise', dbName: 'ent_value_chart', legacyId: 1 },
                { appName: 'valuechart_individual', dbName: 'ind_value_chart', legacyId: 2 },
            ];
            for (const app of apps) {
                await prisma.app.upsert({ where: { legacyId: app.legacyId }, update: { appName: app.appName, dbName: app.dbName }, create: app });
            }

            const plans = [
                { name: 'Free', duration: 'monthly', price: 0, status: 'active', tier: 0, features: JSON.stringify(['1 Flow', 'Basic shapes', 'Export PDF']) },
                { name: 'Pro Monthly', duration: 'monthly', price: 5, status: 'active', tier: 1, features: JSON.stringify(['10 Flows', 'All shapes', 'Export all formats', 'Priority support']) },
                { name: 'Pro Yearly', duration: 'yearly', price: 36, status: 'active', tier: 1, features: JSON.stringify(['10 Flows', 'All shapes', 'Export all formats', 'Priority support']) },
                { name: 'Team Monthly', duration: 'monthly', price: 5, status: 'active', tier: 2, appType: 'enterprise', userAccess: true, userCount: 5, userCost: 2.50, features: JSON.stringify(['Unlimited flows', 'Team collaboration', 'All shapes', 'Admin dashboard', 'Team management']) },
                { name: 'Team Yearly', duration: 'yearly', price: 36, status: 'active', tier: 2, appType: 'enterprise', userAccess: true, userCount: 5, userCost: 25.00, features: JSON.stringify(['Unlimited flows', 'Team collaboration', 'All shapes', 'Admin dashboard', 'Team management']) },
            ];
            for (const plan of plans) {
                await prisma.plan.upsert({ where: { name: plan.name }, update: plan, create: plan });
            }

            logger.info('Auto-seed complete: 5 roles, 2 apps, 5 plans');
        }
    } catch (err) {
        logger.error('Auto-seed failed:', err);
    }
}

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, '0.0.0.0', async () => {
        logger.info(`Server running on port ${PORT}`);
        logger.info(`API Docs available at http://localhost:${PORT}/api-docs`);
        logger.info('Socket.IO attached to HTTP server');
        await autoSeed();
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
        logger.info(`${signal} received. Starting graceful shutdown...`);

        const io = getIO();
        if (io) {
            io.close();
            logger.info('Socket.IO server closed');
        }

        server.close(async () => {
            logger.info('HTTP server closed');
            const { prisma } = require('./src/lib/prisma');
            await prisma.$disconnect();
            logger.info('Database connections closed');
            process.exit(0);
        });

        // Force shutdown after 10 seconds
        setTimeout(() => {
            logger.error('Forced shutdown after timeout');
            process.exit(1);
        }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

module.exports = app; // Export for testing
