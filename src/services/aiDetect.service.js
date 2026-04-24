const { GoogleGenerativeAI } = require("@google/generative-ai");
const logger = require("../utils/logger");

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
CELL TEMPLATES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Process/Rectangle (blue):
<mxCell id="2" value="Step Name"
  style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;"
  vertex="1" parent="1">
  <mxGeometry x="80" y="160" width="140" height="60" as="geometry" />
</mxCell>

Decision/Diamond (yellow):
<mxCell id="3" value="Decision?"
  style="rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;"
  vertex="1" parent="1">
  <mxGeometry x="280" y="150" width="140" height="80" as="geometry" />
</mxCell>

Start/End (oval, red):
<mxCell id="4" value="Start"
  style="ellipse;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;"
  vertex="1" parent="1">
  <mxGeometry x="80" y="80" width="120" height="60" as="geometry" />
</mxCell>

Edge/Arrow:
<mxCell id="5" value=""
  style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;
  jettySize=auto;html=1;"
  edge="1" source="2" target="3" parent="1">
  <mxGeometry relative="1" as="geometry" />
</mxCell>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYOUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Top-down: Start x=480,y=80. Move y+120 per step. Width=140, Height=60
Left-right: Start x=80,y=300. Move x+200 per step. Width=140, Height=60
Keep within: x=0-1169, y=0-827
Aim for 6-15 nodes. Maximum 20 nodes.

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

  // Immediate NO — UI complaints, questions, analysis requests
  const noPatterns = [
    "button",
    "not working",
    "not seeing",
    "cant see",
    "can't see",
    "where is",
    "how do i",
    "what is",
    "why",
    "help me",
    "confused",
    "issue",
    "problem",
    "error",
    "not shown",
    "not visible",
    "analyze",
    "analyse",
    "what does",
    "explain",
    "tell me about",
    "what information",
    "summary",
    "upload",
    "uploaded",
  ];
  if (noPatterns.some((p) => lower.includes(p))) return false;

  // Must have explicit create/generate + diagram keyword
  const createWords = ["create", "generate", "make", "draw", "build", "design"];
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
  ];

  const hasCreate = createWords.some((w) => lower.includes(w));
  const hasDiagram = diagramWords.some((w) => lower.includes(w));

  return hasCreate && hasDiagram;
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
    model: "claude-sonnet-4-5",
    max_tokens: 2000,
    system: DIAGRAM_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const xml = response.content?.[0]?.text?.trim();
  if (!xml || !xml.includes("<mxGraphModel")) {
    throw new Error("Claude did not return valid mxGraph XML");
  }
  return { xml, model: "claude-sonnet-4-5" };
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
  return { xml, model: "gemini-2.5-flash" };
}

async function generateDiagramXml(userMessage, userPlan = "free") {
  const useClaude =
    (userPlan === "pro" || userPlan === "team") &&
    process.env.ANTHROPIC_API_KEY &&
    process.env.ANTHROPIC_API_KEY !== "placeholder";

  const maxAttempts = 3;
  let currentPrompt = userMessage;
  let lastError = null;

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
        throw new Error(
          `XML generation failed after ${maxAttempts} attempts: ${validation.error}`,
        );
      }

      return result;
    } catch (err) {
      lastError = err.message;
      if (attempt >= maxAttempts) {
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

module.exports = {
  isDiagramRequest,
  generateDiagramXml,
  sanitizeXml,
  validateXml,
};
