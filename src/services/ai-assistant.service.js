// Chat provider: Google Gemini 2.0 Flash
// Migrated from OpenAI GPT-4 / GPT-4o.
// Diagram generation lives in aiDetect.service.js:
//   Pro / Team → Claude Sonnet
//   Free       → Gemini
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { prisma } = require("../lib/prisma");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const { logAiRequest } = require("../utils/aiLogger");

const CHAT_MODEL = "gemini-2.5-flash";

let _geminiAiClient = null;
function getGeminiAiClient() {
  if (!_geminiAiClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new AppError(
        "GEMINI_API_KEY not configured",
        500,
        "AI_NOT_CONFIGURED",
      );
    }
    _geminiAiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _geminiAiClient;
}

// Convert OpenAI-style history to Gemini history format.
// OpenAI roles: system | user | assistant | document(custom)
// Gemini roles: user | model  (no system — passed via systemInstruction)
// 'document' rows are coerced into a user turn with a [Attached document] prefix.
function toGeminiHistory(rows) {
  const history = [];
  for (const msg of rows) {
    if (msg.role === "system") continue;
    if (msg.role === "document") {
      const fileName = msg.metadata?.fileName || "file";
      history.push({
        role: "user",
        parts: [
          {
            text: `[Attached document: ${fileName}]\n${(msg.content || "").substring(0, 6000)}`,
          },
        ],
      });
      continue;
    }
    history.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content || "" }],
    });
  }
  // Gemini requires the first turn to be 'user'.
  while (history.length && history[0].role !== "user") history.shift();
  return history;
}

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
The system automatically detects diagram intent. You do NOT need to
tell the user to click any button. The UI handles that automatically.

When diagram intent is detected (user uses words like create, generate,
make, draw, build, design WITH diagram, flow, chart, flowchart, VSM,
workflow, process map, org chart, map, visualization):
  1. Briefly confirm what diagram you will create (2-3 bullet points)
  2. End with: "I'll generate this diagram for you — click ⚡ Generate below to use 1 credit."
  3. NEVER say "Click the Generate Diagram button" without that button being present
  4. NEVER include raw mxGraph XML in your chat response

When it is a COMBINED request (e.g. "analyse this and generate a diagram",
"review the requirements and create a flowchart"):
  1. Briefly summarise your analysis in 2-3 lines
  2. Then describe the diagram you will create
  3. End with: "I'll generate this diagram for you — click ⚡ Generate below to use 1 credit."

When it is NOT a diagram request — do NOT mention diagrams or buttons:
  - Questions starting with what, why, how, when, where
  - UI complaints ("I don't see a button") — guide them instead
  - Pure analysis or explanation requests with no diagram ask
  - Greetings or general conversation
  - Requests to edit/fix an existing diagram (guide them instead)

AMBIGUOUS REQUESTS (when unclear):
  If user says "I want to visualize" or "show me" without clear
  diagram intent, ask once:
  "Would you like me to generate a diagram for this?
   Just say 'yes, generate a diagram' and I'll set it up."

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
- Free: 10 AI diagram credits (one-time), 10 flows, Gemini AI
- Pro: 50 AI diagram credits (lifetime), unlimited flows, Claude AI (Sonnet)
- Team: 40 AI diagram credits per seat/month, team collaboration, Claude AI (Sonnet)

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
MODERN CARD STYLE — THIS IS THE HOUSE STYLE (use for EVERY diagram, ANY niche)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every node is a soft, rounded "card" with an EMOJI icon, a BOLD title, and a
small gray subtitle. This exact look must be produced for any topic the user
asks about (sales, HR, devops, cooking, medical, finance — anything). Only the
words, icons, and colors change per step; the card structure never changes.

── NODE LABELS (always 2 lines, always an icon) ──
Build every process/action node label as HTML like this (html=1 required):
  <b>{ICON} {Short Title}</b><br><span style="font-size:11px;color:#64748B;">{subtitle}</span>
Example value:
  <b>🛒 Customer Places Order</b><br><span style="font-size:11px;color:#64748B;">via Website / App</span>
Keep title max ~4 words; subtitle max ~5 words. Pick an emoji that fits the
step's MEANING for the user's niche (see ICON MAP). Every card has an icon.

── COLOR ROLES (assign by meaning; cycle colors so the diagram looks lively) ──
Do NOT make everything one color. Rotate through this palette by step meaning:
  Green  (default / positive / process):  fillColor=#E6F7EE;strokeColor=#34A881;fontColor=#0F172A;
  Purple (validate / review / notify):     fillColor=#EDE9FE;strokeColor=#8B5CF6;fontColor=#0F172A;
  Blue   (action / transport / system):    fillColor=#DBEAFE;strokeColor=#3B82F6;fontColor=#0F172A;
  Amber  (wait / warning / manual):        fillColor=#FEF3C7;strokeColor=#F59E0B;fontColor=#0F172A;
  Red    (error / cancel / reject / alert):fillColor=#FEE2E2;strokeColor=#EF4444;fontColor=#0F172A;

── EXACT STYLE STRINGS (copy, then swap in the color role) ──
Process / Action card (width=210 height=64):
  rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=12;verticalAlign=middle;shadow=1;fontSize=13;{COLOR ROLE}

Decision / Diamond (width=150 height=100) — always amber, bold, centered:
  rhombus;whiteSpace=wrap;html=1;align=center;verticalAlign=middle;shadow=1;fontSize=13;fontStyle=1;fillColor=#FEF3C7;strokeColor=#F59E0B;fontColor=#92400E;
  Label: <b>{ICON}<br>{Question?}</b>

Start pill (width=130 height=48) — light green stadium:
  rounded=1;arcSize=50;whiteSpace=wrap;html=1;align=center;verticalAlign=middle;shadow=1;fontSize=14;fontStyle=1;fillColor=#D1FAE5;strokeColor=#34A881;fontColor=#065F46;
  Label: <b>▶ Start</b>

End pill (width=130 height=48) — SOLID green, white text:
  rounded=1;arcSize=50;whiteSpace=wrap;html=1;align=center;verticalAlign=middle;shadow=1;fontSize=14;fontStyle=1;fillColor=#34A881;strokeColor=#2E9673;fontColor=#FFFFFF;
  Label: <b>✅ End</b>

Database / Storage (width=120 height=80):
  shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;shadow=1;fillColor=#DBEAFE;strokeColor=#3B82F6;fontColor=#0F172A;fontSize=12;

── EDGES (arrows) ──
Base edge style:
  edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;fontStyle=1;
Decision branch labels are COLORED PILLS via labelBackgroundColor:
  Yes / positive branch — add: labelBackgroundColor=#34A881;fontColor=#FFFFFF;  value="Yes"
  No / negative branch  — add: labelBackgroundColor=#EF4444;fontColor=#FFFFFF;  value="No"
  Other labels          — add: labelBackgroundColor=#FFFFFF;fontColor=#334155;
IMPORTANT: do NOT set fixed exitX/exitY/entryX/entryY on edges. Leaving the
connection points unset lets draw.io attach each arrow to the nearest side of
the source/target node (floating connection points), so arrows stay aligned
for branches and left-right layouts. Fixed exit/entry (e.g. exitX=0.5;exitY=1)
forces every arrow out the bottom-centre, which detaches connectors on branches.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ICON MAP — pick the emoji that fits each step (extend as needed per niche)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
start ▶  end ✅🏁  process ⚙️  user/customer 👤  team 👥  cart 🛒  order/doc 📋
payment/money 💳💰  email ✉️  ship/deliver 🚚  package 📦  calendar/schedule 📅
time/wait ⏱️  review/check 🔍  approve 👍  reject/cancel ❌  warning ⚠️
database 🗄️  cloud ☁️  api/system 🔌  code 💻  data/report 📊  idea 💡
call 📞  location 📍  security/lock 🔒  ai 🤖  build 🛠️  test 🧪  deploy 🚀
Choose the one that best matches the step's meaning in the user's topic.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYOUT RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Top-down flow (default):
  Main column centered near x=470. First node y=60.
  Vertical gap between cards: 110px (card height 64 + ~46 gap).
  Card size: width=210, height=64. Decisions: width=150, height=100.

Decision branches (when a diamond splits Yes/No):
  Left branch column near x=250, right branch column near x=690.
  Put the positive/continue path on ONE side, the exception path on the other,
  then merge both back into a single End pill at the bottom center.

Left-right flow (only if user asks for horizontal / value stream):
  First node x=60, y=320. Horizontal gap 240px. Card width=200, height=64.

Swimlane layout (only if user asks for cross-functional / by role):
  Container x=40, y=40, width=1080, height=600. Each lane height=140,
  startSize=30. Lane fills alternate soft gray #F8FAFC and white.
  Cards inside lanes are the SAME modern card style above.

Keep ALL content within x=0-1169, y=0-827.
Aim for 6-14 nodes. Maximum 20 nodes. Space cards generously — never overlap.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORKED EXAMPLE — imitate this structure/style for ANY topic
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(Adapt the words, icons and colors to whatever the user asked for.)
<mxCell id="2" value="&lt;b&gt;▶ Start&lt;/b&gt;" style="rounded=1;arcSize=50;whiteSpace=wrap;html=1;align=center;verticalAlign=middle;shadow=1;fontSize=14;fontStyle=1;fillColor=#D1FAE5;strokeColor=#34A881;fontColor=#065F46;" vertex="1" parent="1"><mxGeometry x="405" y="60" width="130" height="48" as="geometry"/></mxCell>
<mxCell id="3" value="&lt;b&gt;🛒 Customer Places Order&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B;&quot;&gt;via Website / App&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=12;verticalAlign=middle;shadow=1;fontSize=13;fillColor=#E6F7EE;strokeColor=#34A881;fontColor=#0F172A;" vertex="1" parent="1"><mxGeometry x="365" y="150" width="210" height="64" as="geometry"/></mxCell>
<mxCell id="4" value="&lt;b&gt;📦&lt;br&gt;In Stock?&lt;/b&gt;" style="rhombus;whiteSpace=wrap;html=1;align=center;verticalAlign=middle;shadow=1;fontSize=13;fontStyle=1;fillColor=#FEF3C7;strokeColor=#F59E0B;fontColor=#92400E;" vertex="1" parent="1"><mxGeometry x="395" y="256" width="150" height="100" as="geometry"/></mxCell>
<mxCell id="10" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#FFFFFF;fontSize=12;fontStyle=1;labelBackgroundColor=#34A881;" edge="1" parent="1" source="4" target="3" value="Yes"><mxGeometry relative="1" as="geometry"/></mxCell>
Notes on the example: titles are bold, subtitles are the small gray span, the
diamond puts its icon on line 1 and the question on line 2, and the "Yes" edge
label is a green pill via labelBackgroundColor. HTML in values is entity-encoded
(&lt; &gt; &amp; &quot;) because it lives inside an XML attribute.

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
✓ All nodes are connected (no floating isolated nodes)
✓ EVERY card uses the modern style: emoji icon + bold title + gray subtitle
✓ Start is a light-green pill, End is a solid-green pill (white text)
✓ Colors are rotated by meaning (not all one color); decisions are amber diamonds
✓ Decision branches use colored pill edge labels (green Yes / red No)
✓ shadow=1 on nodes; edges use rounded orthogonal style, strokeColor #94A3B8`;

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

  async setConsent(userId, consented, ipAddress, activeTeamId = null) {
    // Issue #5 (Fix_issues.md): AI consent is ONE row per user with no team
    // dimension. getConsent() is team-aware (a team's consent is governed by
    // the TEAM OWNER's row), but setConsent used to be blind to context and
    // always wrote the caller's personal row. A member accepting/declining
    // (or merely dismissing) the re-prompt shown in a team workspace then
    // silently overwrote the personal consent they'd granted in their own
    // workspace. Guard: a member operating in a team context can NOT change
    // consent — team consent is owner-controlled — so we no-op on their
    // personal row and return the owner-governed state read-only.
    if (activeTeamId) {
      const team = await prisma.team.findFirst({
        where: { id: activeTeamId, deletedAt: null },
        select: { teamOwnerId: true },
      });
      if (team && team.teamOwnerId !== userId) {
        const member = await prisma.teamMember.findFirst({
          where: { teamId: activeTeamId, userId },
          select: { id: true },
        });
        if (member) {
          const ownerConsent = await prisma.aiConsent.findUnique({
            where: { userId: team.teamOwnerId },
          });
          return {
            consented: ownerConsent
              ? ownerConsent.consented && !ownerConsent.revokedAt
              : false,
            source: "team",
            readOnly: true,
          };
        }
      }
    }

    // Personal context, or the caller IS the team owner (their row is what
    // governs team consent) → write their own row.
    const existing = await prisma.aiConsent.findUnique({
      where: { userId },
    });

    if (existing) {
      await prisma.aiConsent.update({
        where: { userId },
        data: {
          consented,
          consentedAt: consented ? new Date() : existing.consentedAt,
          revokedAt: consented ? null : new Date(),
          ipAddress,
        },
      });
    } else {
      await prisma.aiConsent.create({
        data: {
          userId,
          consented,
          consentedAt: consented ? new Date() : null,
          ipAddress,
        },
      });
    }
    return { consented, source: "self" };
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

    // Subscription, team memberships, and projects are mutually independent —
    // fetch them in one batch instead of three serial awaits.
    const [subscription, teamMemberships, projects] = await Promise.all([
      // Subscription (with ALL fields needed for date questions)
      prisma.subscription.findFirst({
        where: { userId, status: "active" },
        include: {
          plan: { select: { name: true, duration: true, price: true } },
        },
      }),
      // Teams
      prisma.teamMember.findMany({
        where: { userId },
        include: { team: true },
      }),
      // Projects
      prisma.project.findMany({
        where: { createdBy: userId, deletedAt: null },
        select: {
          name: true,
          _count: { select: { flows: true } },
        },
      }),
    ]);

    const teamIds = teamMemberships.map((tm) => tm.team?.id).filter(Boolean);
    const teamMemberCounts =
      teamIds.length > 0
        ? await prisma.teamMember.groupBy({
            by: ["teamId"],
            where: { teamId: { in: teamIds } },
            _count: { id: true },
          })
        : [];

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

    if (!process.env.GEMINI_API_KEY) {
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

    // Conversation history (last 20 turns) — used as Gemini chat history.
    // Excludes the user message just saved; we send that via sendMessage().
    const historyRows = await prisma.aiMessage.findMany({
      where: {
        conversationId: conversation.id,
        role: { in: ["user", "assistant", "document"] },
      },
      orderBy: { createdAt: "desc" },
      take: 21, // 20 prior turns + the just-saved user msg we'll strip
    });
    const orderedHistory = historyRows.reverse();
    // Drop the last message (the user prompt we just wrote) — we send it
    // via chat.sendMessage so it appears as the live turn, not history.
    if (
      orderedHistory.length &&
      orderedHistory[orderedHistory.length - 1].role === "user" &&
      orderedHistory[orderedHistory.length - 1].content === message
    ) {
      orderedHistory.pop();
    }

    // ALWAYS gather fresh context from the database (not from frontend)
    const ctx = await this.getUserContext(userId, appContext);

    // Build context block with ALL user data
    const contextBlock = this._buildContextBlock(ctx);

    const fullSystemPrompt = SYSTEM_PROMPT + contextBlock;
    const geminiHistory = toGeminiHistory(orderedHistory);

    const _t0 = Date.now();
    try {
      const genAI = getGeminiAiClient();
      const model = genAI.getGenerativeModel({
        model: CHAT_MODEL,
        systemInstruction: fullSystemPrompt,
      });
      const chatSession = model.startChat({ history: geminiHistory });
      const result = await chatSession.sendMessage(message);
      const aiContent = result.response.text();
      logAiRequest({
        userId,
        app: appContext,
        model: CHAT_MODEL,
        endpoint: "ai-assistant.chat",
        success: true,
        durationMs: Date.now() - _t0,
      });

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
      logAiRequest({
        userId,
        app: appContext,
        model: CHAT_MODEL,
        endpoint: "ai-assistant.chat",
        success: false,
        durationMs: Date.now() - _t0,
        error: error.message,
      });

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

    if (!process.env.GEMINI_API_KEY) {
      throw new AppError("AI service not configured", 500, "AI_NOT_CONFIGURED");
    }

    const userPrompt = existingXml
      ? `Here is the existing diagram XML:\n${existingXml}\n\nUser request: ${message}\n\nModify or extend the diagram based on the request.`
      : `Generate a draw.io diagram for: ${message}`;

    const _t0 = Date.now();
    try {
      const genAI = getGeminiAiClient();
      const model = genAI.getGenerativeModel({
        model: CHAT_MODEL,
        systemInstruction: DIAGRAM_SYSTEM_PROMPT,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.3,
          maxOutputTokens: 4000,
        },
      });
      const result = await model.generateContent(userPrompt);
      const parsed = JSON.parse(result.response.text());
      logAiRequest({
        userId,
        app: appContext,
        model: CHAT_MODEL,
        endpoint: "ai-assistant.generateDiagramFromText",
        success: true,
        durationMs: Date.now() - _t0,
      });

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
      logAiRequest({
        userId,
        app: appContext,
        model: CHAT_MODEL,
        endpoint: "ai-assistant.generateDiagramFromText",
        success: false,
        durationMs: Date.now() - _t0,
        error: error.message,
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

  async getHistory(userId, page = 1, limit = 20, appContext = null) {
    const skip = (page - 1) * limit;
    const where = { userId };
    if (appContext) where.appContext = appContext;

    const [conversations, total] = await Promise.all([
      prisma.aiConversation.findMany({
        where,
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
      prisma.aiConversation.count({ where }),
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
    if (!process.env.GEMINI_API_KEY) {
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

    // Conversation history (doc + prior turns) — Gemini chat format.
    // The just-saved user instruction is the live turn (sendMessage).
    const historyRows = await prisma.aiMessage.findMany({
      where: {
        conversationId: conversation.id,
        role: { in: ["user", "assistant", "document"] },
      },
      orderBy: { createdAt: "desc" },
      take: 21,
    });
    const orderedHistory = historyRows.reverse();
    if (
      orderedHistory.length &&
      orderedHistory[orderedHistory.length - 1].role === "user" &&
      orderedHistory[orderedHistory.length - 1].content === userInstruction
    ) {
      orderedHistory.pop();
    }

    const ctx = await this.getUserContext(userId, appContext);
    const contextBlock = this._buildContextBlock(ctx);
    const fullSystemPrompt = SYSTEM_PROMPT + contextBlock;
    const geminiHistory = toGeminiHistory(orderedHistory);

    const _t0 = Date.now();
    try {
      const genAI = getGeminiAiClient();
      const model = genAI.getGenerativeModel({
        model: CHAT_MODEL,
        systemInstruction: fullSystemPrompt,
        generationConfig: { maxOutputTokens: 2000 },
      });
      const chatSession = model.startChat({ history: geminiHistory });
      const result = await chatSession.sendMessage(userInstruction);
      const aiContent = result.response.text();
      logAiRequest({
        userId,
        app: appContext,
        model: CHAT_MODEL,
        endpoint: "ai-assistant.analyzeDocument",
        success: true,
        durationMs: Date.now() - _t0,
      });

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
      logAiRequest({
        userId,
        app: appContext,
        model: CHAT_MODEL,
        endpoint: "ai-assistant.analyzeDocument",
        success: false,
        durationMs: Date.now() - _t0,
        error: error.message,
      });
      throw new AppError("Failed to analyze document.", 500, "AI_ERROR");
    }
  }

  async deleteAllData(userId) {
    // GDPR erasure: delete ALL AI-derived personal data for the user.
    //
    // Deletion order (dependency-safe):
    //   1. AiMessage   — child of AiConversation (cascade would handle it,
    //                    but we delete explicitly so the deleteMany is scoped
    //                    to conversationIds we own, avoiding a relation-filter
    //                    that Prisma batchDelete does not support).
    //   2. AiConversation — parent of AiMessage
    //   3. AiJob       — contains prompt + generated XML (AI-derived data)
    //   4. AiCreditUsage  — audit log of credit deductions
    //   5. AiCreditBalance — credit balances
    //   6. AiConsent   — consent record (last, so consent checks during the
    //                    transaction do not see a missing consent mid-flight)
    //
    // Wrapped in an explicitly Serializable transaction so the erasure is both
    // atomic and isolation-safe: at the DB default (Read Committed) a row
    // inserted into one of these tables mid-wipe could survive the deleteMany
    // scan. Serializable makes the wipe behave as if it ran with no concurrent
    // writer. Single-user GDPR erasure has near-zero contention, so the rare
    // Serializable write-conflict (Prisma P2034) is acceptable — the caller can
    // simply retry the delete.
    await prisma.$transaction(
      async (tx) => {
        // Step 1: collect the user's conversation ids so we can delete messages
        // by a concrete FK rather than a nested-relation filter (which Prisma
        // deleteMany does not support and silently skips).
        const convIds = await tx.aiConversation
          .findMany({ where: { userId }, select: { id: true } })
          .then((rows) => rows.map((r) => r.id));

        if (convIds.length > 0) {
          await tx.aiMessage.deleteMany({
            where: { conversationId: { in: convIds } },
          });
        }

        await tx.aiConversation.deleteMany({ where: { userId } });
        await tx.aiJob.deleteMany({ where: { userId } });
        await tx.aiCreditUsage.deleteMany({ where: { userId } });
        await tx.aiCreditBalance.deleteMany({ where: { userId } });
        await tx.aiConsent.deleteMany({ where: { userId } });
      },
      { isolationLevel: "Serializable" },
    );

    return { deleted: true };
  }
}

module.exports = new AiAssistantService();
