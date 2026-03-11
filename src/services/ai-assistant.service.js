const OpenAI = require('openai');
const { prisma } = require('../lib/prisma');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are Value Charts AI, a helpful assistant for the Value Charts diagramming application.

You have THREE capabilities:

1. **Answer questions about the user's ACTUAL account data** — You have real-time data about this user loaded below. When users ask about their flows, teams, subscription, projects, shapes, chat groups, or account details, ALWAYS answer using the SPECIFIC data provided. Give exact numbers, names, and dates. NEVER say "I cannot access your data" or "I don't have real-time information" — you DO have it, it is provided below under "USER'S ACCOUNT DATA".

2. **App Knowledge** — Answer questions about how to use Value Charts:
   - Creating flows: Click "New Flow" in the sidebar or dashboard, choose a template, opens draw.io editor in a new tab
   - Inviting team members: Go to Teams page, click your team, use "Invite Member" button, enter email
   - Sharing flows: Open a flow, click the share icon, add collaborators with view or edit permissions
   - Password reset: Click "Forgot Password" on the login page, enter your email, check inbox for reset link
   - ValueChart vs Pro: ValueChart is free with unlimited flows. ValueChart Pro is a one-time $1 purchase with additional features
   - Subscription plans: Free plan available, Pro plan for $1 one-time, Team plans with monthly/yearly pricing
   - Shapes: Custom shapes library with SVG, HTML, image, and stencil shapes organized into groups
   - Chat: Team chat with groups, messages, and file sharing
   - Projects: Organize flows into named project folders
   - Trash: Deleted flows go to trash, can be restored within 30 days

3. **Diagram Generation** — When users ask to create/generate/design a flow, flowchart, diagram, or process:
   - Generate valid draw.io XML (mxGraphModel format)
   - Include proper node positioning (x, y coordinates spaced out for readability)
   - Use appropriate shapes: rectangles for processes, diamonds for decisions, rounded rectangles for start/end
   - Connect nodes with edges that have labels where appropriate
   - Wrap the XML in <mxGraphModel>...</mxGraphModel> tags

IMPORTANT RULES:
- When the user asks about their data (flows, teams, subscription, projects, etc.), ALWAYS use the specific data provided below. Respond with exact counts, names, and dates.
- NEVER say you cannot access the user's data. The data IS provided to you in every request.
- Be concise. Use bullet points for lists.
- If asked about something not in the provided data, say you don't have that specific information.

When generating a diagram, respond with a brief description + the draw.io XML.
For how-to questions, respond with clear step-by-step instructions.`;

class AiAssistantService {
    async getConsent(userId) {
        const consent = await prisma.aiConsent.findUnique({
            where: { userId },
        });
        return { consented: consent ? consent.consented && !consent.revokedAt : false };
    }

    async setConsent(userId, consented, ipAddress) {
        const existing = await prisma.aiConsent.findUnique({
            where: { userId },
        });

        if (existing) {
            return prisma.aiConsent.update({
                where: { userId },
                data: {
                    consented,
                    consentedAt: consented ? new Date() : existing.consentedAt,
                    revokedAt: consented ? null : new Date(),
                    ipAddress,
                },
            });
        }

        return prisma.aiConsent.create({
            data: {
                userId,
                consented,
                consentedAt: consented ? new Date() : null,
                ipAddress,
            },
        });
    }

    async getUserContext(userId, appContext) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                name: true,
                email: true,
                createdAt: true,
                currentVersion: true,
                hasPro: true,
                proPurchasedAt: true,
                proFlowLimit: true,
                proAdditionalFlowsPurchased: true,
                proUnlimitedFlows: true,
            },
        });

        if (!user) return null;

        // Flow stats
        const [flowCount, recentFlowCount, recentFlows, trashedFlowCount, sharedWithMeCount, sharedByMeCount] = await Promise.all([
            prisma.flow.count({
                where: { ownerId: userId, deletedAt: null },
            }),
            prisma.flow.count({
                where: { ownerId: userId, deletedAt: null, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
            }),
            prisma.flow.findMany({
                where: { ownerId: userId, deletedAt: null },
                orderBy: { updatedAt: 'desc' },
                take: 5,
                select: { name: true, updatedAt: true, createdAt: true },
            }),
            prisma.flow.count({
                where: { ownerId: userId, deletedAt: { not: null } },
            }),
            prisma.flowShare.count({
                where: { sharedWithId: userId },
            }),
            prisma.flowShare.count({
                where: { sharedById: userId },
            }),
        ]);

        // Subscription (with ALL fields needed for date questions)
        const subscription = await prisma.subscription.findFirst({
            where: { userId, status: 'active' },
            include: { plan: { select: { name: true, duration: true, price: true } } },
        });

        // Teams
        const teamMemberships = await prisma.teamMember.findMany({
            where: { userId },
            include: { team: true },
        });
        const teamIds = teamMemberships.map(tm => tm.team?.id).filter(Boolean);
        const teamMemberCounts = teamIds.length > 0
            ? await prisma.teamMember.groupBy({
                by: ['teamId'],
                where: { teamId: { in: teamIds } },
                _count: { id: true },
            })
            : [];

        // Projects
        const projects = await prisma.project.findMany({
            where: { createdBy: userId, deletedAt: null },
            select: {
                name: true,
                _count: { select: { flows: true } },
            },
        });

        // Shapes
        const shapeCount = await prisma.shape.count({
            where: { ownerId: userId },
        });

        // Shape groups
        const shapeGroupCount = await prisma.shapeGroup.count({
            where: { userId },
        });

        // Chat groups
        const chatGroupCount = await prisma.chatGroupUser.count({
            where: { userId },
        });

        // Flow limit
        let flowLimitLabel = '10 (Free plan)';
        if (user.hasPro) {
            if (user.proUnlimitedFlows) {
                flowLimitLabel = 'Unlimited (Pro)';
            } else {
                const limit = user.proFlowLimit + user.proAdditionalFlowsPurchased;
                flowLimitLabel = `${limit} (Pro)`;
            }
        } else if (subscription) {
            flowLimitLabel = 'Unlimited (Subscription)';
        }

        // Current plan
        let plan = 'Free';
        if (user.hasPro) plan = 'ValueChart Pro';
        else if (subscription?.plan) plan = `${subscription.plan.name} (${subscription.plan.duration})`;

        return {
            user: {
                name: user.name,
                email: user.email,
                joinedAt: user.createdAt,
                currentApp: user.currentVersion || appContext,
                plan,
            },
            flows: {
                total: flowCount,
                createdLast7Days: recentFlowCount,
                inTrash: trashedFlowCount,
                limit: flowLimitLabel,
                sharedWithMe: sharedWithMeCount,
                sharedByMe: sharedByMeCount,
                recent: recentFlows.map(f => ({
                    name: f.name,
                    lastEdited: f.updatedAt,
                    createdAt: f.createdAt,
                })),
            },
            subscription: subscription ? {
                plan: subscription.plan?.name,
                duration: subscription.plan?.duration,
                price: subscription.plan?.price,
                status: subscription.status,
                startedAt: subscription.startedAt,
                expiresAt: subscription.expiresAt,
                isRecurring: subscription.isRecurring,
            } : null,
            pro: user.hasPro ? {
                purchasedAt: user.proPurchasedAt,
                flowLimit: user.proUnlimitedFlows ? 'Unlimited' : (user.proFlowLimit + user.proAdditionalFlowsPurchased),
                flowsUsed: flowCount,
                unlimitedFlows: user.proUnlimitedFlows,
            } : null,
            teams: teamMemberships.map(tm => {
                const countEntry = teamMemberCounts.find(c => c.teamId === tm.teamId);
                return {
                    name: tm.team?.name || 'Unnamed Team',
                    role: tm.role,
                    memberCount: countEntry?._count?.id || 0,
                };
            }),
            projects: projects.map(p => ({
                name: p.name,
                flowCount: p._count?.flows || 0,
            })),
            shapes: {
                total: shapeCount,
                groups: shapeGroupCount,
            },
            chat: {
                groupCount: chatGroupCount,
            },
        };
    }

    async chat(userId, message, conversationId, appContext, userContext) {
        // Verify consent
        const consent = await prisma.aiConsent.findUnique({
            where: { userId },
        });
        if (!consent || !consent.consented || consent.revokedAt) {
            throw new AppError('Please accept the AI data processing terms to use this feature.', 403, 'CONSENT_REQUIRED');
        }

        if (!process.env.OPENAI_API_KEY) {
            throw new AppError('AI service not configured', 500, 'AI_NOT_CONFIGURED');
        }

        // Get or create conversation
        let conversation;
        if (conversationId) {
            conversation = await prisma.aiConversation.findFirst({
                where: { id: conversationId, userId },
            });
            if (!conversation) {
                throw new AppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
            }
        } else {
            // Use first few words of message as title
            const title = message.length > 50 ? message.substring(0, 50) + '...' : message;
            conversation = await prisma.aiConversation.create({
                data: { userId, title, appContext },
            });
        }

        // Save user message
        await prisma.aiMessage.create({
            data: {
                conversationId: conversation.id,
                role: 'user',
                content: message,
            },
        });

        // Get conversation history (last 10 messages for context)
        const history = await prisma.aiMessage.findMany({
            where: { conversationId: conversation.id },
            orderBy: { createdAt: 'desc' },
            take: 10,
        });
        const orderedHistory = history.reverse();

        // ALWAYS gather fresh context from the database (not from frontend)
        const ctx = await this.getUserContext(userId, appContext);

        // Build context block with ALL user data
        const contextBlock = this._buildContextBlock(ctx);

        const fullSystemPrompt = SYSTEM_PROMPT + contextBlock;

        // Build OpenAI messages
        const openaiMessages = [
            { role: 'system', content: fullSystemPrompt },
            ...orderedHistory.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content,
            })),
        ];

        try {
            const completion = await openai.chat.completions.create({
                model: 'gpt-4',
                messages: openaiMessages,
                max_tokens: 4000,
            });

            const aiContent = completion.choices[0].message.content;

            // Check if response contains draw.io XML
            const xmlMatch = aiContent.match(/<mxGraphModel[\s\S]*?<\/mxGraphModel>/);
            const diagramXml = xmlMatch ? xmlMatch[0] : null;

            // Extract the text message (without the XML)
            let textMessage = aiContent;
            if (diagramXml) {
                textMessage = aiContent.replace(diagramXml, '').replace(/```xml\s*/g, '').replace(/```\s*/g, '').trim();
            }

            // Determine template name from the message context
            let templateName = null;
            let openTemplate = false;
            if (diagramXml) {
                openTemplate = true;
                // Try to extract a meaningful name
                const namePatterns = [
                    /(?:created|generated|designed|here(?:'s| is))\s+(?:a|an|the)\s+(.+?)(?:\.|!|:|\n|$)/i,
                    /(.+?)(?:flowchart|diagram|flow|chart|process)/i,
                ];
                for (const pattern of namePatterns) {
                    const match = textMessage.match(pattern);
                    if (match) {
                        templateName = match[1].trim().replace(/^["']|["']$/g, '');
                        break;
                    }
                }
                if (!templateName) templateName = 'AI Generated Flow';
            }

            // Build suggested steps for diagrams
            let suggestedSteps = [];
            if (openTemplate) {
                suggestedSteps = [
                    'Click "Open in Editor" to load this diagram',
                    'Customize the shapes, labels, and connections',
                    'Save your flow to keep it in your library',
                ];
            }

            const responseData = {
                message: textMessage,
                templateName,
                openTemplate,
                drawioXml: diagramXml,
                suggestedSteps,
            };

            // Save assistant message
            await prisma.aiMessage.create({
                data: {
                    conversationId: conversation.id,
                    role: 'assistant',
                    content: textMessage,
                    diagramXml,
                    metadata: responseData,
                },
            });

            return {
                conversationId: conversation.id,
                response: responseData,
            };
        } catch (error) {
            logger.error('AI chat error', { error: error.message, userId });

            if (error.status === 429) {
                throw new AppError('AI rate limit exceeded. Please try again later.', 429, 'AI_RATE_LIMIT');
            }
            throw new AppError('AI service temporarily unavailable.', 500, 'AI_ERROR');
        }
    }

    _buildContextBlock(ctx) {
        if (!ctx) return '';

        const formatDate = (d) => {
            if (!d) return 'N/A';
            return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        };

        let block = `\n\n---\n## USER'S ACCOUNT DATA (this is REAL data from the database — use it to answer questions)\n\n`;

        // Account
        block += `### Account\n`;
        block += `- Name: ${ctx.user?.name || 'Not set'}\n`;
        block += `- Email: ${ctx.user?.email || 'Not set'}\n`;
        block += `- Joined: ${formatDate(ctx.user?.joinedAt)}\n`;
        block += `- Current app: ${ctx.user?.currentApp === 'pro' ? 'ValueChart Pro' : 'ValueChart'}\n`;
        block += `- Plan: ${ctx.user?.plan || 'Free'}\n\n`;

        // Subscription
        block += `### Subscription\n`;
        if (ctx.subscription) {
            block += `- Plan name: ${ctx.subscription.plan}\n`;
            block += `- Duration: ${ctx.subscription.duration}\n`;
            block += `- Price: $${ctx.subscription.price || 0}\n`;
            block += `- Status: ${ctx.subscription.status}\n`;
            block += `- Started: ${formatDate(ctx.subscription.startedAt)}\n`;
            block += `- Expires/Renews: ${formatDate(ctx.subscription.expiresAt)}\n`;
            block += `- Auto-renew: ${ctx.subscription.isRecurring ? 'Yes' : 'No'}\n`;
        } else {
            block += `- No active subscription (Free plan)\n`;
        }
        block += `\n`;

        // Pro
        if (ctx.pro) {
            block += `### ValueChart Pro\n`;
            block += `- Purchased: ${formatDate(ctx.pro.purchasedAt)}\n`;
            block += `- Flow limit: ${ctx.pro.flowLimit}\n`;
            block += `- Flows used: ${ctx.pro.flowsUsed}\n`;
            block += `- Unlimited flows: ${ctx.pro.unlimitedFlows ? 'Yes' : 'No'}\n\n`;
        }

        // Flows
        block += `### Flows\n`;
        block += `- Total active flows: ${ctx.flows?.total ?? 0}\n`;
        block += `- Flow limit: ${ctx.flows?.limit || 'Unknown'}\n`;
        block += `- Created in last 7 days: ${ctx.flows?.createdLast7Days ?? 0}\n`;
        block += `- In trash: ${ctx.flows?.inTrash ?? 0}\n`;
        block += `- Shared with me: ${ctx.flows?.sharedWithMe ?? 0}\n`;
        block += `- Shared by me: ${ctx.flows?.sharedByMe ?? 0}\n`;
        if (ctx.flows?.recent?.length > 0) {
            block += `- Recent flows:\n`;
            for (const f of ctx.flows.recent) {
                block += `  - "${f.name}" (last edited ${formatDate(f.lastEdited)}, created ${formatDate(f.createdAt)})\n`;
            }
        } else {
            block += `- Recent flows: none\n`;
        }
        block += `\n`;

        // Teams
        block += `### Teams\n`;
        if (ctx.teams?.length > 0) {
            block += `- Member of ${ctx.teams.length} team(s):\n`;
            for (const t of ctx.teams) {
                block += `  - "${t.name}" — role: ${t.role}, ${t.memberCount} member(s)\n`;
            }
        } else {
            block += `- Not a member of any teams\n`;
        }
        block += `\n`;

        // Projects
        block += `### Projects\n`;
        if (ctx.projects?.length > 0) {
            block += `- ${ctx.projects.length} project(s):\n`;
            for (const p of ctx.projects) {
                block += `  - "${p.name}" — ${p.flowCount} flow(s)\n`;
            }
        } else {
            block += `- No projects\n`;
        }
        block += `\n`;

        // Shapes
        block += `### Shapes\n`;
        block += `- Total custom shapes: ${ctx.shapes?.total ?? 0}\n`;
        block += `- Shape groups: ${ctx.shapes?.groups ?? 0}\n\n`;

        // Chat
        block += `### Chat\n`;
        block += `- Chat groups: ${ctx.chat?.groupCount ?? 0}\n`;

        return block;
    }

    async getHistory(userId, page = 1, limit = 20) {
        const skip = (page - 1) * limit;

        const [conversations, total] = await Promise.all([
            prisma.aiConversation.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    messages: {
                        orderBy: { createdAt: 'asc' },
                        take: 1,
                        select: { content: true },
                    },
                },
            }),
            prisma.aiConversation.count({ where: { userId } }),
        ]);

        return {
            conversations: conversations.map(c => ({
                id: c.id,
                title: c.title,
                firstMessage: c.messages[0]?.content || null,
                createdAt: c.createdAt,
            })),
            total,
            page,
            limit,
        };
    }

    async getConversation(userId, conversationId) {
        const conversation = await prisma.aiConversation.findFirst({
            where: { id: conversationId, userId },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' },
                    select: {
                        id: true,
                        role: true,
                        content: true,
                        diagramXml: true,
                        metadata: true,
                        createdAt: true,
                    },
                },
            },
        });

        if (!conversation) {
            throw new AppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
        }

        return conversation;
    }

    async deleteAllData(userId) {
        // Delete all messages via cascade, then conversations, then consent
        await prisma.$transaction([
            prisma.aiMessage.deleteMany({
                where: { conversation: { userId } },
            }),
            prisma.aiConversation.deleteMany({
                where: { userId },
            }),
            prisma.aiConsent.deleteMany({
                where: { userId },
            }),
        ]);

        return { deleted: true };
    }
}

module.exports = new AiAssistantService();
