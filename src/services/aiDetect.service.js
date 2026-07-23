const { GoogleGenerativeAI } = require("@google/generative-ai");
const logger = require("../utils/logger");
const { getUserAiTier, getTierByUserId } = require("../utils/userTier");
const { logAiRequest } = require("../utils/aiLogger");

const DIAGRAM_SYSTEM_PROMPT = `You are an expert mxGraph XML diagram generator for the ValueCharts platform.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE FORMAT — CRITICAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY the raw mxGraph XML.
No JSON wrapper. No markdown. No backticks. No explanation.
Start your response with: <mxGraphModel
End your response with: </mxGraphModel>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
XML STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1"
  tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1"
  pageWidth="1169" pageHeight="827" math="0" shadow="0">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    [YOUR CELLS HERE — start id from 2]
  </root>
</mxGraphModel>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — PICK THE RIGHT DIAGRAM FAMILY (do this FIRST)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Read the request and choose the ONE family that matches. Do NOT
default to a flowchart. Use that family's shapes and its layout rule.

- process / steps / workflow / VSM ............ FLOWCHART
- pie / percentage / share / distribution ..... PIE CHART
- bar / column / compare quantities ........... BAR CHART
- trend / over time / line graph .............. LINE CHART
- brainstorm / ideas / topic + subtopics ...... MIND MAP
- hierarchy / reporting / team structure ...... ORG CHART
- classes / objects / methods / attributes .... UML CLASS
- actors / messages / interaction over time ... UML SEQUENCE
- database / entities / tables / relations .... ER DIAGRAM
- servers / routers / firewalls / topology .... NETWORK
- AWS / Azure / GCP / cloud architecture ...... CLOUD
- business process / pools / lanes / gateways . BPMN
- overlapping sets / commonality .............. VENN
- app screen / UI / mockup / wireframe ........ WIREFRAME
If unclear, ask yourself what the user will SEE, then match above.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VISUAL STYLE — modern, on-brand, high-contrast (APPLY TO EVERY SHAPE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Make diagrams look clean and premium (like Lucidchart) — NOT the dated draw.io
defaults. On EVERY vertex you MUST add: fontFamily=Inter;fontSize=13;
fontColor=<matching dark tone>;rounded=1;shadow=1;strokeWidth=2;html=1;
whiteSpace=wrap;align=center;verticalAlign=middle;spacingLeft=6;spacingRight=6.
Use fontStyle=1 (bold) on titles/headers.

BRAND PALETTE — pick fills from here (each row = fillColor / strokeColor /
fontColor, all high-contrast). The primary green is the app brand colour:
  Green  (primary): fillColor=#E6F7F0;strokeColor=#34A881;fontColor=#0E5A43
  Blue            : fillColor=#E8F1FE;strokeColor=#3B82F6;fontColor=#1E3A8A
  Purple          : fillColor=#F1EBFB;strokeColor=#8B5CF6;fontColor=#5B21B6
  Amber           : fillColor=#FFF4E0;strokeColor=#F59E0B;fontColor=#92580A
  Rose (stop/end) : fillColor=#FDEBEC;strokeColor=#EF4444;fontColor=#9B1C1C
  Teal            : fillColor=#E3F6F5;strokeColor=#14B8A6;fontColor=#0F766E
  Slate (neutral) : fillColor=#EEF1F5;strokeColor=#64748B;fontColor=#334155
Rules:
- The GREEN palette is the app brand and MUST be the dominant colour: use it for
  the main content nodes (process steps, primary boxes, the central mind-map
  node, class boxes, entities, tasks). Use Amber for decisions/gateways, Rose
  for start-stop / end / error, and Blue/Purple/Teal ONLY to group or
  distinguish secondary sets. Most nodes should be green; accents are the
  minority. Do NOT make every node a different colour (max ~3-4 hues total).
- NEVER use the old washed-out draw.io default palette (the pale
  light-blue/yellow/red/green/orange fills). Always use the palette above.
- Edges: style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#94A3B8;strokeWidth=2;fontColor=#475569;endArrow=block;". Curved connectors (mind maps): rounded=1;edgeStyle=none.
- For vivid fills (pie/bar slices) use the SATURATED stroke colours as the
  fillColor (#34A881,#3B82F6,#F59E0B,#8B5CF6,#14B8A6,#EF4444) with
  fontColor=#FFFFFF;fontStyle=1.

The example snippets below show STRUCTURE and may list older colours — you MUST
override their colours with this palette and add the style keys above.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIAGRAM TYPE LIBRARY — one canonical example per family
(copy the shape STYLE, then build the full diagram from real content)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FLOWCHART ─────────────────────────────────────────
Process (blue):  style="rounded=1;whiteSpace=wrap;html=1;fillColor=#E8F1FE;strokeColor=#3B82F6;"  (w140 h60)
Decision (yellow): style="rhombus;whiteSpace=wrap;html=1;fillColor=#FFF4E0;strokeColor=#F59E0B;"  (w140 h80)
Start/End (red): style="ellipse;whiteSpace=wrap;html=1;fillColor=#FDEBEC;strokeColor=#EF4444;"  (w120 h60)
Edge: style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;" edge="1" source="2" target="3"
Layout: top-down, first node x=480 y=80, each next y+120. Label decision edges "Yes"/"No".

PIE CHART ──────────────────────────────────────────
One cell PER slice, all same x/y/size, stacked. Angles are FRACTIONS of the
whole circle (0..1). startAngle of slice N = sum of all previous fractions.
Slice fraction = sliceValue / totalOfAllValues. Put the % in the value.
<mxCell id="2" value="Design 40%"
  style="shape=mxgraph.basic.pie;startAngle=0;endAngle=0.4;fillColor=#E8F1FE;strokeColor=#3B82F6;html=1;"
  vertex="1" parent="1"><mxGeometry x="360" y="200" width="260" height="260" as="geometry"/></mxCell>
<mxCell id="3" value="Dev 35%"
  style="shape=mxgraph.basic.pie;startAngle=0.4;endAngle=0.75;fillColor=#E6F7F0;strokeColor=#34A881;html=1;"
  vertex="1" parent="1"><mxGeometry x="360" y="200" width="260" height="260" as="geometry"/></mxCell>
<mxCell id="4" value="QA 25%"
  style="shape=mxgraph.basic.pie;startAngle=0.75;endAngle=1;fillColor=#F1EBFB;strokeColor=#8B5CF6;html=1;"
  vertex="1" parent="1"><mxGeometry x="360" y="200" width="260" height="260" as="geometry"/></mxCell>
Rule: the LAST slice endAngle must be exactly 1. If the user gives no
numbers, split evenly. A plain % in a label is fine; never wrap a word
in percent signs like %name% (that is a reserved placeholder).

BAR CHART ──────────────────────────────────────────
Bars share a baseline (bottom y). Taller bar = bigger value. Vary only height + x.
Baseline at y=460. bar_top_y = 460 - height. Space bars x+120.
<mxCell id="2" value="Q1" style="whiteSpace=wrap;html=1;fillColor=#E8F1FE;strokeColor=#3B82F6;" vertex="1" parent="1"><mxGeometry x="120" y="300" width="80" height="160" as="geometry"/></mxCell>
<mxCell id="3" value="Q2" style="whiteSpace=wrap;html=1;fillColor=#E6F7F0;strokeColor=#34A881;" vertex="1" parent="1"><mxGeometry x="240" y="220" width="80" height="240" as="geometry"/></mxCell>
Optional axis: one thin rectangle (h2) as the baseline line at y=460.

LINE CHART ─────────────────────────────────────────
Small point vertices connected by straight edges, left→right, y inverted by value.
Point: style="ellipse;whiteSpace=wrap;html=1;fillColor=#3B82F6;strokeColor=#3B82F6;" (w10 h10)
Edge between consecutive points: style="endArrow=none;html=1;strokeColor=#3B82F6;"

MIND MAP ───────────────────────────────────────────
Central topic ellipse at canvas center (x=520 y=380), branches radiate around it.
Center: style="ellipse;whiteSpace=wrap;html=1;fillColor=#F1EBFB;strokeColor=#8B5CF6;fontStyle=1;" (w160 h70)
Branch: style="rounded=1;whiteSpace=wrap;html=1;fillColor=#E8F1FE;strokeColor=#3B82F6;" (w140 h50)
Edge: style="edgeStyle=none;rounded=1;html=1;endArrow=none;"
Place branches at up/down/left/right offsets ~260px from center.

ORG CHART ──────────────────────────────────────────
Boxes in a tree, top = highest level. Box: style="rounded=0;whiteSpace=wrap;html=1;fillColor=#E8F1FE;strokeColor=#3B82F6;" (w160 h50)
Edge: style="edgeStyle=orthogonalEdgeStyle;html=1;endArrow=none;"
Layout: root centered top; each level y+120; siblings spread x+200.

UML CLASS ──────────────────────────────────────────
Class = swimlane with stacked member rows.
<mxCell id="2" value="User" style="swimlane;fontStyle=1;childLayout=stackLayout;horizontal=1;startSize=26;html=1;fillColor=#E8F1FE;strokeColor=#3B82F6;" vertex="1" parent="1"><mxGeometry x="80" y="80" width="180" height="110" as="geometry"/></mxCell>
<mxCell id="3" value="+ id: int" style="text;html=1;align=left;spacingLeft=6;" vertex="1" parent="2"><mxGeometry y="26" width="180" height="26" as="geometry"/></mxCell>
<mxCell id="4" value="+ login()" style="text;html=1;align=left;spacingLeft=6;" vertex="1" parent="2"><mxGeometry y="52" width="180" height="26" as="geometry"/></mxCell>
Relations: style="endArrow=block;endFill=0;html=1;" (inheritance) between classes.

UML SEQUENCE ───────────────────────────────────────
Each actor = a lifeline column. Messages = horizontal arrows, time flows DOWN.
Lifeline: style="shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=1;" (w100 h300)
Message: style="html=1;endArrow=block;" edge between lifelines, lower y = later.
Space lifelines x+200.

ER DIAGRAM ─────────────────────────────────────────
Entity = swimlane like UML class but rows are columns of a table.
Relationship edge: style="endArrow=ERmany;startArrow=ERone;html=1;" (crow's-foot).

NETWORK ────────────────────────────────────────────
style="sketch=0;html=1;shape=mxgraph.networks.router;" / .switch / .firewall / .server
(w60 h60, add a value label). Connect with plain edges. Tier: core top, edge below.

CLOUD (AWS/Azure/GCP) ──────────────────────────────
AWS resource: style="sketch=0;html=1;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;" (w60 h60)
(swap resIcon: aws4.s3, aws4.lambda, aws4.rds, aws4.api_gateway ...). Group related
resources inside a container rectangle. Connect with edges.

BPMN ───────────────────────────────────────────────
Start event: style="ellipse;html=1;fillColor=#E6F7F0;strokeColor=#34A881;" (w40 h40)
Task: style="rounded=1;whiteSpace=wrap;html=1;fillColor=#E8F1FE;strokeColor=#3B82F6;" (w120 h60)
Gateway: style="rhombus;html=1;fillColor=#FFF4E0;strokeColor=#F59E0B;" (w50 h50)
End event: style="ellipse;html=1;fillColor=#FDEBEC;strokeColor=#EF4444;strokeWidth=3;" (w40 h40)
Left→right flow. Optionally wrap in a pool: style="swimlane;html=1;horizontal=0;".

VENN ───────────────────────────────────────────────
2-3 overlapping ellipses, semi-transparent so overlap shows.
style="ellipse;whiteSpace=wrap;html=1;fillColor=#E8F1FE;strokeColor=#3B82F6;fillOpacity=40;" (w240 h240)
Overlap circles by ~100px on x.

WIREFRAME / MOCKUP ─────────────────────────────────
Frame: style="shape=mxgraph.mockup.containers.browserWindow;html=1;" (w320 h240)
Inside: buttons style="rounded=1;html=1;fillColor=#f5f5f5;strokeColor=#666;",
text fields style="rounded=0;html=1;fillColor=#ffffff;strokeColor=#999;",
labels style="text;html=1;align=left;". Stack rows top→down inside the frame.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GENERAL LAYOUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Keep everything within x=0-1169, y=0-827.
Never overlap non-chart nodes; leave ~40px gaps.
Node count by complexity: SIMPLE ≤ 8, MEDIUM ≤ 15, COMPLEX ≤ 25.
Pick the smallest count that fully answers the request.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Every id must be unique — never repeat
✓ Every edge source and target must be valid existing ids
✓ NEVER use & in labels — use "and" or "&amp;"
✓ NEVER use <, >, ', " in label text
✓ NEVER truncate — generate complete diagram
✓ NEVER add comments or placeholder text
✓ All tags must be properly closed
✓ Your XML will be parsed by a strict validator — any error fails`;

const INTENT_PROMPT_TEMPLATE = (
  msg,
) => `Analyze this user message carefully and determine if the user is
EXPLICITLY requesting to CREATE or GENERATE a NEW diagram RIGHT NOW.

RETURN "YES" ONLY IF ALL of these are true:
1. Contains an action word: create, generate, make, draw, build,
   design, produce, show me a diagram, give me a flow
2. AND refers to a visual: diagram, flow, chart, flowchart,
   VSM, workflow, process map, org chart, map, visualization,
   mind map, ER diagram, sequence diagram

RETURN "NO" FOR ALL of these:
- Questions (what is, how does, why, when, where, explain, tell me)
- UI complaints (button not showing, can't see, not working)
- Analysis requests (analyze, summarize, review, check)
- Greetings (hello, hi, thanks, ok)
- General conversation (what day, weather, jokes)
- Requests about existing diagrams (fix, update, change my diagram)
- Vague visualization (I want to visualize, show me, display)
- Document analysis without explicit diagram request
- Negative statements (I don't see, I can't find, not showing)

EXAMPLES:
"Create a login flow diagram" → YES
"Generate a VSM for my factory" → YES
"Make a flowchart for user registration" → YES
"Draw an org chart for my team" → YES
"What is a flowchart?" → NO
"I don't see the generate button" → NO
"Analyze my document" → NO
"How do I create a diagram?" → NO
"I want to visualize my process" → NO
"Fix my existing diagram" → NO
"Hello, can you help me?" → NO
"Create a report" → NO (not a diagram)

User message: "${msg}"

Reply with ONLY one word — YES or NO — nothing else.`;

function getGemini() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

async function isDiagramRequest(userMessage) {
  if (!userMessage || typeof userMessage !== "string") return false;
  const lower = userMessage.toLowerCase().trim();

  // Must have explicit create/generate + diagram keyword
  const createWords = [
    "create",
    "generate",
    "make",
    "draw",
    "build",
    "design",
    "produce",
    // Common ways users phrase a diagram request (still require a diagram noun
    // alongside, so "i need help" stays chat). Added after live testing showed
    // "need a mind map for this business" was missed.
    "need",
    "want",
  ];
  const diagramWords = [
    "diagram",
    "flow",
    "chart",
    "vsm",
    "flowchart",
    "workflow",
    "process map",
    "org chart",
    "map",
    "visualization",
    "visualisation",
    // Families added with the expanded prompt library (Step 1) that lack the
    // words diagram/chart/map — without these the intent gate wrongly routes
    // them to chat (verified live 2026-07-22).
    "architecture",
    "network",
    "topology",
    "wireframe",
    "mockup",
    "bpmn",
    "gantt",
  ];

  const hasCreate = createWords.some((w) => lower.includes(w));
  const hasDiagram = diagramWords.some((w) => lower.includes(w));

  // If the message has BOTH a create word AND a diagram word,
  // it is a diagram request — even if it also contains analysis keywords
  // like 'analyse', 'explain', etc. (e.g. "analyse this and generate a diagram")
  if (hasCreate && hasDiagram) return true;

  // Soft-block patterns — only block when there is NO diagram intent.
  // These keywords alone (without create+diagram) mean the user just wants chat.
  const noPatterns = [
    "button",
    "not working",
    "not seeing",
    "cant see",
    "can't see",
    "where is",
    "how do i",
    "what is",
    "help me",
    "confused",
    "issue",
    "problem",
    "error",
    "not shown",
    "not visible",
    "what does",
    "explain",
    "tell me about",
    "what information",
    "summary",
    "upload",
    "uploaded",
  ];
  if (noPatterns.some((p) => lower.includes(p))) return false;

  // No clear create+diagram pair found
  return false;
}

// ─────────────────────────────────────────────────────────────
// Complexity classification (Step 3)
// Returns { type: SIMPLE|MEDIUM|COMPLEX, diagramType, estimatedNodes, source }
// Primary: a tiny Gemini JSON call. Fallback: deterministic keyword scoring.
// Used by detectIntent to (later) size the credit estimate and route models.
// ─────────────────────────────────────────────────────────────

const COMPLEXITY_PROMPT = `You classify diagram-generation requests. Return ONLY compact JSON, no markdown, no explanation:
{"type":"SIMPLE","diagramType":"flowchart","estimatedNodes":6}
Rules:
- SIMPLE: one clear idea, few elements (<=8 nodes). e.g. a small pie, a 3-step flow.
- MEDIUM: a full but focused diagram (9-15 nodes). e.g. a login flow with branches.
- COMPLEX: detailed / comprehensive / many parts (16-25 nodes). e.g. a full system architecture.
diagramType must be one of: flowchart, pie, bar, line, mindmap, orgchart, uml-class, uml-sequence, er, network, cloud, bpmn, venn, wireframe.
estimatedNodes is the integer node count you would need to fully satisfy the request (2-25).`;

// First matching family wins; default flowchart.
const DIAGRAM_TYPE_MATCHERS = [
  ["pie", /\b(pie|percentage|percent|share|distribution|proportion)\b/],
  ["bar", /\b(bar chart|bar graph|column chart|histogram)\b/],
  ["line", /\b(line chart|line graph|trend|over time|time series)\b/],
  ["mindmap", /\b(mind ?map|brainstorm|idea map)\b/],
  [
    "orgchart",
    /\b(org ?chart|organi[sz]ation|hierarchy|reporting line|team structure)\b/,
  ],
  ["uml-sequence", /\b(sequence diagram|interaction diagram|message flow)\b/],
  ["uml-class", /\b(class diagram|uml class|object model)\b/],
  ["er", /\b(er diagram|entity relationship|database schema|data model)\b/],
  ["network", /\b(network|topology|router|firewall|switch)\b/],
  ["cloud", /\b(aws|azure|gcp|cloud architecture|lambda|s3|ec2|rds)\b/],
  ["bpmn", /\b(bpmn|business process|swimlane|gateway)\b/],
  ["venn", /\b(venn|overlap|intersection)\b/],
  ["wireframe", /\b(wireframe|mockup|ui screen|screen design|prototype)\b/],
  ["flowchart", /\b(flow ?chart|workflow|process|vsm|value stream|steps?)\b/],
];

function detectDiagramType(text) {
  for (const [type, re] of DIAGRAM_TYPE_MATCHERS) {
    if (re.test(text)) return type;
  }
  return "flowchart";
}

function classifyComplexityByKeywords(message) {
  const text = String(message || "").toLowerCase();
  const diagramType = detectDiagramType(text);

  let score = 0;
  const complexSignals = [
    "detailed",
    "comprehensive",
    "complete",
    "full",
    "entire",
    "complex",
    "large",
    "advanced",
    "end to end",
    "end-to-end",
    "whole",
    "in depth",
    "in-depth",
    "elaborate",
    "every step",
    "all steps",
  ];
  if (complexSignals.some((w) => text.includes(w))) score += 3;

  // Each connector (and / comma / arrow) hints at more elements.
  const connectors = (text.match(/\band\b|,|;|->|→/g) || []).length;
  score += Math.min(connectors, 6) * 0.7;

  if (text.length > 240) score += 2;
  else if (text.length > 120) score += 1;

  // Some families are inherently richer / lighter.
  if (
    ["er", "network", "cloud", "bpmn", "uml-sequence", "uml-class"].includes(
      diagramType,
    )
  )
    score += 1.5;
  if (["pie", "venn", "line"].includes(diagramType)) score -= 1;

  let type, estimatedNodes;
  if (score <= 1.5) {
    type = "SIMPLE";
    estimatedNodes = 6;
  } else if (score < 5) {
    type = "MEDIUM";
    estimatedNodes = 12;
  } else {
    type = "COMPLEX";
    estimatedNodes = 20;
  }
  return { type, diagramType, estimatedNodes, source: "keyword" };
}

async function classifyComplexity(message, context = "") {
  // When a conversation context is supplied, complexity is judged from the
  // whole discussion (not just the one-line request) — so "a mind map for this
  // business" after describing a business rates by the described detail.
  const classifyInput = context
    ? `Conversation so far:\n${context}\n\nDiagram request: ${message}`
    : String(message || "");

  const fallback = classifyComplexityByKeywords(classifyInput);
  if (!process.env.GEMINI_API_KEY) return fallback;

  try {
    const genAI = getGemini();
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: COMPLEXITY_PROMPT,
    });

    // NOTE: generationConfig MUST be passed in the generateContent REQUEST
    // (not at model creation) for @google/generative-ai 0.21.0 to honour
    // responseMimeType JSON mode. thinkingBudget:0 turns off gemini-2.5-flash
    // "thinking" tokens — otherwise they consume maxOutputTokens before any
    // JSON is emitted (and add cost) for what is a trivial classification.
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: classifyInput.slice(0, 2000) }],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 150,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    // Belt-and-braces: strip any stray fences / prose, then take the {...} block.
    let raw = result.response
      .text()
      .trim()
      .replace(/```json\s*/gi, "")
      .replace(/```/g, "")
      .trim();
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart > -1 && jsonEnd > jsonStart) {
      raw = raw.slice(jsonStart, jsonEnd + 1);
    }
    const parsed = JSON.parse(raw);

    const type = ["SIMPLE", "MEDIUM", "COMPLEX"].includes(
      String(parsed.type).toUpperCase(),
    )
      ? String(parsed.type).toUpperCase()
      : fallback.type;
    const estimatedNodes = Number.isFinite(parsed.estimatedNodes)
      ? Math.max(2, Math.min(25, Math.round(parsed.estimatedNodes)))
      : fallback.estimatedNodes;
    const diagramType =
      typeof parsed.diagramType === "string" && parsed.diagramType.trim()
        ? parsed.diagramType.trim().toLowerCase()
        : fallback.diagramType;

    return { type, diagramType, estimatedNodes, source: "gemini" };
  } catch (err) {
    logger.warn(
      `[AIDetect] complexity classifier failed, using keyword fallback: ${err.message}`,
    );
    return fallback;
  }
}

// Pre-generation credit estimate shown to the user (Step 4). This is a
// heuristic RANGE derived from the complexity tier — the exact charge is
// computed from real token usage after generation (Step 7). Ranges align
// with the locked decisions: Simple ~3, Medium ~4-5, Complex ~6 credits.
const CREDIT_ESTIMATE_RANGES = {
  SIMPLE: { min: 2, max: 4, likely: 3 },
  MEDIUM: { min: 4, max: 6, likely: 5 },
  COMPLEX: { min: 5, max: 8, likely: 6 },
};

function estimateCredits(complexity) {
  const type =
    complexity && complexity.type
      ? String(complexity.type).toUpperCase()
      : "MEDIUM";
  return CREDIT_ESTIMATE_RANGES[type] || CREDIT_ESTIMATE_RANGES.MEDIUM;
}

function sanitizeXml(xml) {
  if (!xml) return xml;

  // Strip markdown code fences if the model wrapped the XML
  xml = xml
    .replace(/```xml\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Ensure the document starts at <mxGraphModel
  if (!xml.startsWith("<mxGraphModel")) {
    const start = xml.indexOf("<mxGraphModel");
    if (start > -1) xml = xml.substring(start);
  }

  // Trim trailing garbage after closing tag
  const closeIdx = xml.lastIndexOf("</mxGraphModel>");
  if (closeIdx > -1) {
    xml = xml.substring(0, closeIdx + "</mxGraphModel>".length);
  }

  // Escape bare ampersands (NOT part of valid XML entities)
  xml = xml.replace(
    /&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g,
    "&amp;",
  );

  // Strip control characters that break XML parsers
  xml = xml.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  return xml;
}

function validateXml(xml) {
  if (!xml) return { valid: false, error: "Empty XML" };
  if (!xml.includes("<mxGraphModel")) {
    return { valid: false, error: "Not a valid mxGraph XML" };
  }
  if (!xml.includes("</mxGraphModel>")) {
    return { valid: false, error: "Incomplete XML structure" };
  }
  const bareAmp = /&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;
  if (bareAmp.test(xml)) {
    return { valid: false, error: "Unescaped special characters in XML" };
  }
  return { valid: true };
}

async function generateWithClaude(userMessage) {
  const Anthropic = require("@anthropic-ai/sdk");
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: DIAGRAM_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const xml = response.content?.[0]?.text?.trim();
  if (!xml || !xml.includes("<mxGraphModel")) {
    throw new Error("Claude did not return valid mxGraph XML");
  }
  const usage = {
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  };
  return { xml, model: "claude-sonnet-4-6", usage };
}

async function generateWithGemini(userMessage) {
  const genAI = getGemini();
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: DIAGRAM_SYSTEM_PROMPT,
  });

  const result = await model.generateContent(userMessage);
  const xml = result.response.text().trim();

  if (!xml || !xml.includes("<mxGraphModel")) {
    throw new Error("Gemini did not return valid mxGraph XML");
  }
  const um = result.response.usageMetadata || {};
  const usage = {
    inputTokens: um.promptTokenCount || 0,
    outputTokens: um.candidatesTokenCount || 0,
  };
  return { xml, model: "gemini-2.5-flash", usage };
}

async function generateDiagramXml(
  userMessage,
  user = null,
  complexity = null,
  context = "",
) {
  // Conversation-aware generation — when the caller supplies recent chat
  // context, prepend it so references like "this business" resolve to what was
  // discussed (like Claude/Gemini chat). Reassigning userMessage here means the
  // retry loop below reuses the contextual prompt automatically.
  if (context) {
    userMessage =
      `Conversation so far:\n${context}\n\n---\n` +
      `Using the conversation above as context (resolve references like "this" ` +
      `or "this business" from it), create the following diagram: ${userMessage}`;
  }

  // Tier resolution — accepts user object, userId string, or null.
  // Always falls back to DB lookup (B2 approach) so the result is
  // accurate even if req.user is missing hasPro / subscription.
  let userId = null;
  if (user && typeof user === "object") {
    userId = user.id;
  } else if (typeof user === "string") {
    userId = user;
  }

  const tier = userId ? await getTierByUserId(userId) : "free";

  // Step 6 — model routing by complexity (paid-only Claude):
  //   SIMPLE            → Gemini (all tiers)
  //   MEDIUM / COMPLEX  → Claude if pro/team, else Gemini
  //   free              → always Gemini
  // `complexity` is supplied by the caller (the interactive controller, which
  // already classified the request). When it is NOT supplied (e.g. the
  // document→diagram path, unified later in Step 9), routing falls back to the
  // existing tier-only behaviour — only an explicit SIMPLE sends a paid user
  // to Gemini.
  const isSimple =
    complexity && String(complexity.type).toUpperCase() === "SIMPLE";

  const useClaude =
    (tier === "pro" || tier === "team") &&
    !isSimple &&
    process.env.ANTHROPIC_API_KEY &&
    process.env.ANTHROPIC_API_KEY !== "placeholder";

  logger.info(
    `[AIDetect] tier=${tier} complexity=${complexity ? complexity.type : "unknown"} provider=${useClaude ? "claude" : "gemini"} userId=${userId || "anon"}`,
  );

  const maxAttempts = 3;
  let currentPrompt = userMessage;
  let lastError = null;
  const _t0 = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let result;
      if (useClaude) {
        try {
          result = await generateWithClaude(currentPrompt);
        } catch (err) {
          logger.warn(
            `[AIDetect] Claude failed on attempt ${attempt}, falling back to Gemini: ${err.message}`,
          );
          result = await generateWithGemini(currentPrompt);
        }
      } else {
        result = await generateWithGemini(currentPrompt);
      }

      // Sanitize then validate
      result.xml = sanitizeXml(result.xml);
      const validation = validateXml(result.xml);

      if (!validation.valid) {
        lastError = validation.error;
        logger.warn(
          `[AIDetect] Attempt ${attempt} invalid XML: ${validation.error}`,
        );
        if (attempt < maxAttempts) {
          currentPrompt =
            userMessage +
            `\n\n⚠️ CRITICAL: Previous attempt #${attempt} failed XML validation.
Error: ${validation.error}

You must fix this issue:
- If error mentions "&": Replace all & with &amp; in ALL labels
- If error mentions "id": Check every mxCell has a unique numeric id
- If error mentions "parse": Check all tags are properly closed
- If error mentions "source" or "target": Verify all edge
  source/target ids match existing vertex ids

Return ONLY pure mxGraph XML starting with <mxGraphModel.
No explanation. No markdown. No backticks.
Simple ASCII labels only. No special characters.`;
          continue;
        }
        logAiRequest({
          userId,
          plan: tier,
          model: result.model,
          endpoint: "aiDetect.generateDiagramXml",
          success: false,
          durationMs: Date.now() - _t0,
          error: validation.error,
          meta: { attempts: attempt },
        });
        throw new Error(
          `XML generation failed after ${maxAttempts} attempts: ${validation.error}`,
        );
      }

      logAiRequest({
        userId,
        plan: tier,
        model: result.model,
        endpoint: "aiDetect.generateDiagramXml",
        success: true,
        durationMs: Date.now() - _t0,
        meta: { attempts: attempt },
      });
      return result;
    } catch (err) {
      lastError = err.message;
      if (attempt >= maxAttempts) {
        logAiRequest({
          userId,
          plan: tier,
          model: useClaude ? "claude-sonnet-4-6" : "gemini-2.5-flash",
          endpoint: "aiDetect.generateDiagramXml",
          success: false,
          durationMs: Date.now() - _t0,
          error: err.message,
          meta: { attempts: attempt },
        });
        throw err;
      }
      logger.warn(
        `[AIDetect] Attempt ${attempt} threw: ${err.message} — retrying`,
      );
    }
  }

  throw new Error(
    `Diagram generation failed after ${maxAttempts} attempts: ${lastError}`,
  );
}

/**
 * Tier-aware diagram generation from extracted DOCUMENT text (PDF/Word).
 * Step 9 — unified with the interactive path: the model PICKS the best diagram
 * family from the content (no longer hardcoded to VSM), complexity is
 * classified so provider routing (Step 6) and token-based billing (Step 7)
 * apply exactly as they do for a typed request.
 *
 * @param {string} extractedText raw text pulled from the uploaded document
 * @param {object|string|null} user req.user object, userId string, or null
 * @returns {Promise<{xml: string, model: string, usage: object}>}
 */
async function generateDiagramXmlFromText(extractedText, user = null) {
  // Generic framing — let the model choose the family (flowchart, VSM, org
  // chart, mind map, ER, sequence, architecture, …) using the type selector in
  // DIAGRAM_SYSTEM_PROMPT, instead of forcing a Value Stream Map every time.
  const userMessage =
    `Create the most appropriate diagram from this document. Read the content, ` +
    `choose the diagram family that best represents it, then generate it.\n\n` +
    `Document content:\n${(extractedText || "").substring(0, 3000)}`;

  // Classify so routing + token billing match the interactive path. Defensive:
  // a classifier failure just leaves generateDiagramXml on its tier-only route.
  let complexity = null;
  try {
    complexity = await classifyComplexity(userMessage);
  } catch (_) {
    complexity = null;
  }

  const result = await generateDiagramXml(userMessage, user, complexity);
  return { ...result, complexity };
}

module.exports = {
  isDiagramRequest,
  classifyComplexity,
  classifyComplexityByKeywords,
  estimateCredits,
  generateDiagramXml,
  generateDiagramXmlFromText,
  sanitizeXml,
  validateXml,
};
