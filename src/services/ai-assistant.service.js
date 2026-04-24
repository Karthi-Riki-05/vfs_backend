const OpenAI = require("openai");
const { prisma } = require("../lib/prisma");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are ValueCharts AI Assistant — a smart, friendly, and
context-aware assistant built into the ValueCharts diagramming platform.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IDENTITY & PERSONALITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- You are helpful, warm, and conversational — like ChatGPT or Claude
- You remember everything said earlier in this conversation
- You reply in the same language the user writes in
  (Tamil → reply Tamil, Hindi → reply Hindi, English → reply English)
- You are concise but complete — use bullet points for lists
- You never say "I can only help with ValueCharts topics"
- You engage naturally with ALL questions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GENERAL KNOWLEDGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Answer general questions naturally (math, history, science, jokes)
- For real-time info (today's date, live news, stock prices):
  Acknowledge you don't have live access, then provide what you know
  Example: "I don't have real-time access, but as of my last update..."
- Never refuse to engage — always provide value

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIAGRAM GENERATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ONLY offer to generate a diagram when the user EXPLICITLY uses:
  Action words: create, generate, make, draw, build, design
  WITH diagram words: diagram, flow, chart, flowchart, VSM,
  workflow, process map, org chart, map, visualization

When diagram intent is detected:
  1. Describe what you will create in 2-3 bullet points
  2. End with: "Click the Generate Diagram button below to create this."
  3. NEVER include raw mxGraph XML in your chat response

When it is NOT a diagram request — do NOT mention diagrams:
  - Questions starting with what, why, how, when, where
  - UI complaints ("I don't see a button")
  - Analysis or explanation requests
  - Greetings or general conversation
  - Requests to edit/fix an existing diagram (guide them instead)

AMBIGUOUS REQUESTS (when unclear):
  If user says "I want to visualize" or "show me" without clear
  diagram intent, ask once:
  "Would you like me to generate a diagram for this?
   Just say 'yes, create a diagram' and I'll set it up."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DOCUMENT UPLOAD RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When a document is uploaded:
  1. Analyze and summarize the document content
  2. Identify key processes, entities, or flows present
  3. End with: "Would you like me to generate a diagram from this?
     Tell me what type (flowchart, VSM, org chart, etc.)"
  4. Wait for explicit user confirmation before generating

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UI GUIDANCE (when user reports UI issues)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"I don't see the Generate button":
  → "The ⚡ Generate Diagram button appears in the chat
     after you ask me to create a diagram.
     Try typing: 'Create a login flow diagram'"

"How do I add the diagram to my canvas?":
  → "Click the diagram thumbnail in the chat,
     then click '+ Insert into Canvas' in the preview popup."

"I can't see my diagram":
  → "After clicking Insert, check your canvas — it may have
     been added outside your current view. Press Ctrl+Shift+H
     to fit the diagram to your screen."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VALUECHARTS PLATFORM KNOWLEDGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You have access to the user's real account data below.
Use it when asked about their flows, teams, subscription,
or usage statistics. Be specific — use their actual data.

Plans available:
- Free: 20 AI diagram credits/month, 10 flows, Gemini AI
- Pro: 100 AI diagram credits/month, unlimited flows, Claude AI
- Team: 300 AI diagram credits/month, team collaboration, Claude AI

AI Credits: Used only for diagram generation.
General chat is always unlimited and free.`;

const DIAGRAM_SYSTEM_PROMPT = `You are an expert draw.io XML diagram generator for ValueCharts.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE FORMAT — MANDATORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALWAYS respond with ONLY valid JSON. No markdown. No backticks.
No text before or after the JSON.

{
  "message": "Brief 1-sentence description of what was created",
  "xml": "<mxGraphModel>...</mxGraphModel>",
  "templateName": "Flowchart"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
XML STRUCTURE — MANDATORY RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Root element MUST be exactly:
<mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1"
  tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1"
  pageWidth="1169" pageHeight="827" math="0" shadow="0">

Structure MUST be:
<mxGraphModel ...>
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    ... your cells here ...
  </root>
</mxGraphModel>

CELL RULES:
- Every mxCell MUST have a unique numeric id starting from 2
- NEVER repeat an id — duplicates break the diagram
- Vertex: vertex="1" parent="1" (or parent="SWIMLANE_ID")
- Edge: edge="1" source="SOURCE_ID" target="TARGET_ID" parent="1"
- All attribute values MUST be in double quotes
- All tags MUST be properly closed

FORBIDDEN:
- Never use & in text — use &amp; or the word "and"
- Never use < or > in labels — use text descriptions
- Never use special characters: ' " \` \\ / in labels
- Never truncate the XML — always generate complete diagram
- Never use placeholder comments like "<!-- more nodes -->"
- Never include <mxfile> or <diagram> wrapper tags

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SHAPE STYLES — USE THESE EXACTLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Process/Rectangle:
  rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;

Decision/Diamond:
  rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;

Start/End (Oval):
  ellipse;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;

Database/Storage:
  shape=mxgraph.flowchart.database;whiteSpace=wrap;html=1;
  fillColor=#dae8fc;strokeColor=#6c8ebf;

Swimlane Container:
  swimlane;startSize=30;fillColor=#dae8fc;strokeColor=#6c8ebf;

Process Step (Green):
  rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;

Value Stream Box:
  rounded=1;whiteSpace=wrap;html=1;fillColor=#f5f5f5;
  strokeColor=#666666;fontColor=#333333;

Success/Positive:
  rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;

Warning/Alert:
  rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;

Error/Negative:
  rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;

Arrow/Edge:
  edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;
  jettySize=auto;html=1;exitX=0.5;exitY=1;entryX=0.5;entryY=0;

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYOUT RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Standard flowchart (top-down):
  Start at x=480, y=80
  Space vertically: 120px between nodes
  Node size: width=160, height=60

Standard flowchart (left-right):
  Start at x=80, y=300
  Space horizontally: 200px between nodes
  Node size: width=140, height=60

Swimlane layout:
  Container at x=80, y=80, width=1000, height=600
  Each lane height=120, startSize=30
  Nodes inside lanes: relative to lane parent

Keep ALL content within: x=0-1169, y=0-827
Aim for 6-15 nodes for readability
Maximum 20 nodes for complex diagrams

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIAGRAM TYPES — HOW TO GENERATE EACH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Flowchart/Process flow:
  Use Start oval → Process rectangles → Decision diamonds → End oval
  Top-down layout preferred

Value Stream Map (VSM):
  Use Value Stream boxes horizontally
  Show flow direction with arrows
  Include supplier → process steps → customer

Swimlane/Cross-functional:
  Use swimlane container with multiple lanes
  Each department/role gets its own lane
  Processes flow horizontally across lanes

Org Chart:
  Root node at top center
  Branch down with connecting edges
  Use rectangles, tree layout

ER Diagram:
  Use rectangles for entities
  Show relationships with labeled edges
  Include key attributes in entity labels

Sequence Diagram:
  Use swimlanes for actors
  Show messages as horizontal arrows
  Time flows top to bottom

Mind Map:
  Central topic at center
  Main branches radiating outward
  Sub-branches from main branches

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUALITY CHECKLIST (verify before returning)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before returning your response, verify:
✓ JSON is valid (no trailing commas, no extra text)
✓ All mxCell ids are unique numbers
✓ All edges have valid source and target ids
✓ No & characters (only &amp;)
✓ All tags are properly closed
✓ Diagram fits within 1169x827 bounds
✓ At least one Start and one End node
✓ All nodes are connected (no floating isolated nodes)`;

class AiAssistantService {
  async getConsent(userId, activeTeamId = null) {
    // In a team workspace, the TEAM OWNER's consent governs whether the
    // team can use AI features — individual members inherit it. The
    // acting user (userId) still needs membership verification so we
    // never reveal another team's consent state.
    let targetUserId = userId;
    if (activeTeamId) {
      const team = await prisma.team.findFirst({
        where: { id: activeTeamId, deletedAt: null },
        select: { teamOwnerId: true },
      });
      if (team) {
        const [member, isOwner] = await Promise.all([
          prisma.teamMember.findFirst({
            where: { teamId: activeTeamId, userId },
            select: { id: true },
          }),
          Promise.resolve(team.teamOwnerId === userId),
        ]);
        if (member || isOwner) targetUserId = team.teamOwnerId;
      }
    }
    const consent = await prisma.aiConsent.findUnique({
      where: { userId: targetUserId },
    });
    return {
      consented: consent ? consent.consented && !consent.revokedAt : false,
      source: targetUserId === userId ? "self" : "team",
    };
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
    const [
      flowCount,
      recentFlowCount,
      recentFlows,
      trashedFlowCount,
      sharedWithMeCount,
      sharedByMeCount,
    ] = await Promise.all([
      prisma.flow.count({
        where: { ownerId: userId, deletedAt: null },
      }),
      prisma.flow.count({
        where: {
          ownerId: userId,
          deletedAt: null,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.flow.findMany({
        where: { ownerId: userId, deletedAt: null },
        orderBy: { updatedAt: "desc" },
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
      where: { userId, status: "active" },
      include: {
        plan: { select: { name: true, duration: true, price: true } },
      },
    });

    // Teams
    const teamMemberships = await prisma.teamMember.findMany({
      where: { userId },
      include: { team: true },
    });
    const teamIds = teamMemberships.map((tm) => tm.team?.id).filter(Boolean);
    const teamMemberCounts =
      teamIds.length > 0
        ? await prisma.teamMember.groupBy({
            by: ["teamId"],
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
    let flowLimitLabel = "10 (Free plan)";
    if (user.hasPro) {
      if (user.proUnlimitedFlows) {
        flowLimitLabel = "Unlimited (Pro)";
      } else {
        const limit = user.proFlowLimit + user.proAdditionalFlowsPurchased;
        flowLimitLabel = `${limit} (Pro)`;
      }
    } else if (subscription) {
      flowLimitLabel = "Unlimited (Subscription)";
    }

    // Current plan
    let plan = "Free";
    if (user.hasPro) plan = "ValueChart Pro";
    else if (subscription?.plan)
      plan = `${subscription.plan.name} (${subscription.plan.duration})`;

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
        recent: recentFlows.map((f) => ({
          name: f.name,
          lastEdited: f.updatedAt,
          createdAt: f.createdAt,
        })),
      },
      subscription: subscription
        ? {
            plan: subscription.plan?.name,
            duration: subscription.plan?.duration,
            price: subscription.plan?.price,
            status: subscription.status,
            startedAt: subscription.startedAt,
            expiresAt: subscription.expiresAt,
            isRecurring: subscription.isRecurring,
          }
        : null,
      pro: user.hasPro
        ? {
            purchasedAt: user.proPurchasedAt,
            flowLimit: user.proUnlimitedFlows
              ? "Unlimited"
              : user.proFlowLimit + user.proAdditionalFlowsPurchased,
            flowsUsed: flowCount,
            unlimitedFlows: user.proUnlimitedFlows,
          }
        : null,
      teams: teamMemberships.map((tm) => {
        const countEntry = teamMemberCounts.find((c) => c.teamId === tm.teamId);
        return {
          name: tm.team?.name || "Unnamed Team",
          role: tm.role,
          memberCount: countEntry?._count?.id || 0,
        };
      }),
      projects: projects.map((p) => ({
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
      throw new AppError(
        "Please accept the AI data processing terms to use this feature.",
        403,
        "CONSENT_REQUIRED",
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new AppError("AI service not configured", 500, "AI_NOT_CONFIGURED");
    }

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await prisma.aiConversation.findFirst({
        where: { id: conversationId, userId },
      });
      if (!conversation) {
        throw new AppError(
          "Conversation not found",
          404,
          "CONVERSATION_NOT_FOUND",
        );
      }
    } else {
      conversation = await prisma.aiConversation.create({
        data: { userId, title: null, appContext },
      });
    }

    // Auto-generate title from first user message if still unset
    if (!conversation.title) {
      const title =
        message.length > 50 ? message.substring(0, 50) + "..." : message;
      await prisma.aiConversation.update({
        where: { id: conversation.id },
        data: { title },
      });
      conversation.title = title;
    }

    // Save user message
    await prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: message,
      },
    });

    // Get conversation history (last 20 messages for context — excludes the user msg just saved,
    // we'll reattach it at the end so OpenAI sees the full thread in order)
    const history = await prisma.aiMessage.findMany({
      where: {
        conversationId: conversation.id,
        role: { in: ["user", "assistant", "document"] },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const orderedHistory = history.reverse();

    // ALWAYS gather fresh context from the database (not from frontend)
    const ctx = await this.getUserContext(userId, appContext);

    // Build context block with ALL user data
    const contextBlock = this._buildContextBlock(ctx);

    const fullSystemPrompt = SYSTEM_PROMPT + contextBlock;

    // Build OpenAI messages (role "document" → include as user attachment context)
    const openaiMessages = [
      { role: "system", content: fullSystemPrompt },
      ...orderedHistory.map((msg) => {
        if (msg.role === "document") {
          return {
            role: "user",
            content: `[Attached document]\n${(msg.content || "").substring(0, 6000)}`,
          };
        }
        return {
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content,
        };
      }),
    ];

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
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
        textMessage = aiContent
          .replace(diagramXml, "")
          .replace(/```xml\s*/g, "")
          .replace(/```\s*/g, "")
          .trim();
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
            templateName = match[1].trim().replace(/^["']|["']$/g, "");
            break;
          }
        }
        if (!templateName) templateName = "AI Generated Flow";
      }

      // Build suggested steps for diagrams
      let suggestedSteps = [];
      if (openTemplate) {
        suggestedSteps = [
          'Click "Open in Editor" to load this diagram',
          "Customize the shapes, labels, and connections",
          "Save your flow to keep it in your library",
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
          role: "assistant",
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
      logger.error("AI chat error", { error: error.message, userId });

      if (error.status === 429) {
        throw new AppError(
          "AI rate limit exceeded. Please try again later.",
          429,
          "AI_RATE_LIMIT",
        );
      }
      throw new AppError(
        "AI service temporarily unavailable.",
        500,
        "AI_ERROR",
      );
    }
  }

  async generateDiagramFromText(
    userId,
    message,
    existingXml,
    conversationId,
    appContext,
  ) {
    // Verify consent
    const consent = await prisma.aiConsent.findUnique({ where: { userId } });
    if (!consent || !consent.consented || consent.revokedAt) {
      throw new AppError(
        "Please accept the AI data processing terms to use this feature.",
        403,
        "CONSENT_REQUIRED",
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new AppError("AI service not configured", 500, "AI_NOT_CONFIGURED");
    }

    const messages = [{ role: "system", content: DIAGRAM_SYSTEM_PROMPT }];

    if (existingXml) {
      messages.push({
        role: "user",
        content: `Here is the existing diagram XML:\n${existingXml}\n\nUser request: ${message}\n\nModify or extend the diagram based on the request.`,
      });
    } else {
      messages.push({
        role: "user",
        content: `Generate a draw.io diagram for: ${message}`,
      });
    }

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        response_format: { type: "json_object" },
        max_tokens: 4000,
        temperature: 0.3,
      });

      const parsed = JSON.parse(completion.choices[0].message.content);

      // Save to conversation if provided
      if (conversationId) {
        const conversation = await prisma.aiConversation.findFirst({
          where: { id: conversationId, userId },
        });
        if (conversation) {
          await prisma.aiMessage.create({
            data: { conversationId, role: "user", content: message },
          });
          await prisma.aiMessage.create({
            data: {
              conversationId,
              role: "assistant",
              content: parsed.message || "",
              diagramXml: parsed.xml || null,
              metadata: { intent: "generate_diagram" },
            },
          });
        }
      }

      return {
        intent: "generate_diagram",
        message: parsed.message || "Here is your diagram.",
        xml: parsed.xml || null,
        templateName: this._extractTemplateName(parsed.message || message),
      };
    } catch (error) {
      logger.error("Diagram generation error", {
        error: error.message,
        userId,
      });
      if (error.status === 429) {
        throw new AppError(
          "AI rate limit exceeded. Please try again later.",
          429,
          "AI_RATE_LIMIT",
        );
      }
      throw new AppError("Failed to generate diagram.", 500, "AI_ERROR");
    }
  }

  async generateDiagramFromDocument(userId, documentText, fileName) {
    // Verify consent
    const consent = await prisma.aiConsent.findUnique({ where: { userId } });
    if (!consent || !consent.consented || consent.revokedAt) {
      throw new AppError(
        "Please accept the AI data processing terms to use this feature.",
        403,
        "CONSENT_REQUIRED",
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new AppError("AI service not configured", 500, "AI_NOT_CONFIGURED");
    }

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: DIAGRAM_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Analyze this document and generate the most appropriate draw.io diagram.\n\nDocument name: ${fileName}\nDocument content:\n---\n${documentText.substring(0, 8000)}\n---\n\nDetermine what type of diagram best represents this document (flowchart, process map, org chart, ER diagram, VSM, etc.) and generate it.\nInclude all key entities, processes, and relationships from the document.`,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000,
        temperature: 0.3,
      });

      const parsed = JSON.parse(completion.choices[0].message.content);

      return {
        intent: "generate_diagram_from_document",
        message: parsed.message || `Generated diagram from "${fileName}".`,
        xml: parsed.xml || null,
        fileName,
        templateName: this._extractTemplateName(parsed.message || fileName),
      };
    } catch (error) {
      logger.error("Document diagram generation error", {
        error: error.message,
        userId,
      });
      if (error.status === 429) {
        throw new AppError(
          "AI rate limit exceeded. Please try again later.",
          429,
          "AI_RATE_LIMIT",
        );
      }
      throw new AppError(
        "Failed to generate diagram from document.",
        500,
        "AI_ERROR",
      );
    }
  }

  _extractTemplateName(text) {
    if (!text) return "AI Generated Flow";
    const patterns = [
      /(?:created|generated|designed|here(?:'s| is))\s+(?:a|an|the)\s+(.+?)(?:\.|!|:|\n|$)/i,
      /(.+?)(?:flowchart|diagram|flow|chart|process)/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match)
        return (
          match[1].trim().replace(/^["']|["']$/g, "") || "AI Generated Flow"
        );
    }
    return "AI Generated Flow";
  }

  _buildContextBlock(ctx) {
    if (!ctx) return "";

    const formatDate = (d) => {
      if (!d) return "N/A";
      return new Date(d).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    };

    let block = `\n\n---\n## USER'S ACCOUNT DATA (this is REAL data from the database — use it to answer questions)\n\n`;

    // Account
    block += `### Account\n`;
    block += `- Name: ${ctx.user?.name || "Not set"}\n`;
    block += `- Email: ${ctx.user?.email || "Not set"}\n`;
    block += `- Joined: ${formatDate(ctx.user?.joinedAt)}\n`;
    block += `- Current app: ${ctx.user?.currentApp === "pro" ? "ValueChart Pro" : "ValueChart"}\n`;
    block += `- Plan: ${ctx.user?.plan || "Free"}\n\n`;

    // Subscription
    block += `### Subscription\n`;
    if (ctx.subscription) {
      block += `- Plan name: ${ctx.subscription.plan}\n`;
      block += `- Duration: ${ctx.subscription.duration}\n`;
      block += `- Price: $${ctx.subscription.price || 0}\n`;
      block += `- Status: ${ctx.subscription.status}\n`;
      block += `- Started: ${formatDate(ctx.subscription.startedAt)}\n`;
      block += `- Expires/Renews: ${formatDate(ctx.subscription.expiresAt)}\n`;
      block += `- Auto-renew: ${ctx.subscription.isRecurring ? "Yes" : "No"}\n`;
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
      block += `- Unlimited flows: ${ctx.pro.unlimitedFlows ? "Yes" : "No"}\n\n`;
    }

    // Flows
    block += `### Flows\n`;
    block += `- Total active flows: ${ctx.flows?.total ?? 0}\n`;
    block += `- Flow limit: ${ctx.flows?.limit || "Unknown"}\n`;
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
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true, role: true, createdAt: true },
          },
          _count: { select: { messages: true } },
        },
      }),
      prisma.aiConversation.count({ where: { userId } }),
    ]);

    return {
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        lastMessage: c.messages[0]?.content?.substring(0, 80) || null,
        lastMessageAt: c.messages[0]?.createdAt || c.updatedAt,
        messageCount: c._count.messages,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total,
      page,
      limit,
    };
  }

  async createConversation(userId, appContext) {
    const conversation = await prisma.aiConversation.create({
      data: { userId, appContext: appContext || "free", title: null },
    });
    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
    };
  }

  async getConversationMessages(userId, conversationId) {
    const conversation = await prisma.aiConversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true, title: true, createdAt: true },
    });
    if (!conversation) {
      throw new AppError(
        "Conversation not found",
        404,
        "CONVERSATION_NOT_FOUND",
      );
    }
    const messages = await prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        diagramXml: true,
        metadata: true,
        createdAt: true,
      },
    });
    return { conversation, messages };
  }

  async getConversation(userId, conversationId) {
    const conversation = await prisma.aiConversation.findFirst({
      where: { id: conversationId, userId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
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
      throw new AppError(
        "Conversation not found",
        404,
        "CONVERSATION_NOT_FOUND",
      );
    }

    return conversation;
  }

  async updateConversationTitle(userId, conversationId, title) {
    const conv = await prisma.aiConversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (!conv) {
      throw new AppError(
        "Conversation not found",
        404,
        "CONVERSATION_NOT_FOUND",
      );
    }
    const clean =
      typeof title === "string" && title.trim()
        ? title.trim().substring(0, 100)
        : null;
    const updated = await prisma.aiConversation.update({
      where: { id: conversationId },
      data: { title: clean },
    });
    return { id: updated.id, title: updated.title };
  }

  async deleteConversation(userId, conversationId) {
    const conv = await prisma.aiConversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (!conv) {
      throw new AppError(
        "Conversation not found",
        404,
        "CONVERSATION_NOT_FOUND",
      );
    }
    // Hard delete — AiMessage has cascade on conversationId
    await prisma.aiConversation.delete({ where: { id: conversationId } });
    return { deleted: true };
  }

  async analyzeDocument(
    userId,
    documentText,
    fileName,
    userMessage,
    conversationId,
    appContext,
  ) {
    const consent = await prisma.aiConsent.findUnique({ where: { userId } });
    if (!consent || !consent.consented || consent.revokedAt) {
      throw new AppError(
        "Please accept the AI data processing terms to use this feature.",
        403,
        "CONSENT_REQUIRED",
      );
    }
    if (!process.env.OPENAI_API_KEY) {
      throw new AppError("AI service not configured", 500, "AI_NOT_CONFIGURED");
    }

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await prisma.aiConversation.findFirst({
        where: { id: conversationId, userId },
      });
      if (!conversation) {
        throw new AppError(
          "Conversation not found",
          404,
          "CONVERSATION_NOT_FOUND",
        );
      }
    } else {
      conversation = await prisma.aiConversation.create({
        data: { userId, title: fileName?.substring(0, 50) || null, appContext },
      });
    }

    // Save document as a special message (role: 'document')
    await prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: "document",
        content: documentText.substring(0, 50000),
        metadata: { fileName, extractedAt: new Date().toISOString() },
      },
    });

    // Save user instruction
    const userInstruction =
      userMessage?.trim() ||
      `Please analyze this document "${fileName}" and summarize the key points.`;
    await prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: userInstruction,
      },
    });

    // Build OpenAI messages — include doc + history
    const history = await prisma.aiMessage.findMany({
      where: {
        conversationId: conversation.id,
        role: { in: ["user", "assistant", "document"] },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const orderedHistory = history.reverse();

    const ctx = await this.getUserContext(userId, appContext);
    const contextBlock = this._buildContextBlock(ctx);
    const fullSystemPrompt = SYSTEM_PROMPT + contextBlock;

    const openaiMessages = [
      { role: "system", content: fullSystemPrompt },
      ...orderedHistory.map((msg) => {
        if (msg.role === "document") {
          return {
            role: "user",
            content: `[Attached document: ${msg.metadata?.fileName || "file"}]\n${(msg.content || "").substring(0, 6000)}`,
          };
        }
        return {
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content,
        };
      }),
    ];

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: openaiMessages,
        max_tokens: 2000,
      });
      const aiContent = completion.choices[0].message.content;

      await prisma.aiMessage.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: aiContent,
          metadata: { intent: "analyze_document" },
        },
      });

      return {
        conversationId: conversation.id,
        message: aiContent,
        fileName,
      };
    } catch (error) {
      logger.error("Document analysis error", { error: error.message, userId });
      throw new AppError("Failed to analyze document.", 500, "AI_ERROR");
    }
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
