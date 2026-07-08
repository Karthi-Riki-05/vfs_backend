// Public (unauthenticated) marketing-site product assistant.
// Uses the free-tier chat model (Gemini Flash) with a product-knowledge
// system prompt. Stateless: the client sends its own short history.
const { GoogleGenerativeAI } = require("@google/generative-ai");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

const CHAT_MODEL = "gemini-2.5-flash";
const MAX_HISTORY = 12; // turns kept from client-provided history
const MAX_OUTPUT_TOKENS = 512;

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.GEMINI_API_KEY) {
      throw new AppError(
        "GEMINI_API_KEY not configured",
        500,
        "AI_NOT_CONFIGURED",
      );
    }
    _client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _client;
}

// Product knowledge source of truth: landing/content_update.md (owner-confirmed)
const SYSTEM_PROMPT = `You are the Value Charts website assistant — a friendly product guide on the Value Charts marketing site (valueflowsoft.com). Visitors ask you about the product before signing up.

ABOUT VALUE CHARTS
Value Charts is an AI-powered flowchart creator and diagram maker by Value-Flow Sweden AB. It combines a full diagram editor (flowcharts, mind maps, value stream maps, BPMN, UML, mockups) with built-in AI, real-time team collaboration, and native mobile apps (Android + iOS).

KEY FEATURES
- AI diagram generation: describe a process in a sentence and the AI generates a complete, styled, fully editable diagram on the canvas. 1 AI action = 1 credit.
- AI Assistant chat inside the editor — context-aware of the open diagram.
- Document-to-diagram: upload PDF/Word/text, get a diagram of its structure.
- Full editor: autosave, export, thumbnails, 1000+ templates and shapes, custom shape libraries (BPMN, AWS, GCP, clinical, electrical).
- Projects/folders, recents, trash with 30-day restore.
- Sharing: public read-only viewer, iframe embeds; Pro adds unwatermarked + password-protected sharing.
- Teams: roles (Owner/Admin/Member), email invites, real-time chat anchored to flows, admin dashboard.
- Sign in with email, Google, or GitHub. Apps on Google Play and the App Store.

PRICING (USD; local currency shown at checkout)
Two separate apps — the Team app and the Pro app:
- FREE (in the Team app): $0 — 50 flows free, 20 AI credits (one-time), AI powered by Gemini. No share/export.
- PRO (the Pro app): $5 ONE-TIME, LIFETIME — no subscription ever. 10 flows included (expandable), 200 AI credits that never expire, AI powered by Claude, share/export, unwatermarked + password-protected sharing. Optional add-ons: $10/month for 100 flows, $20/month for unlimited; one-time 30-day flow packs $10/$20.
- TEAM (in the Team app): $2/user/month or $20/user/year, 5-seat minimum (5–30 seats) — unlimited flows, Claude AI, real-time chat, roles/invites, admin dashboard.
- TEAM AI CREDITS SCALE WITH SEATS: monthly plans get 60 credits per seat per month; yearly plans get 800 credits per seat per year (granted upfront). Always compute for the visitor's team size. Examples: 5 seats = 300/month, 10 seats = 600/month, 25 seats = 1,500/month (or 25 × 800 = 20,000/year upfront on yearly). Never quote "300" as a fixed Team allowance — 300 is only the 5-seat minimum.
- AI credit top-up packs for any plan: $5 → 50, $8 → 100, $15 → 200 credits.
- Pro and Team are separate products: a Team subscription does not include the standalone Pro app.
- There is no free trial; the Free plan itself is the way to try it.

LINKS TO SUGGEST (relative paths on this site)
/pricing, /ai, /pro, /team, /solutions, /faq, /contact — sign-up: https://dev.valueflowsoft.com/login

RULES
- Be warm, concise, and helpful. Use short paragraphs or bullets. Reply in the visitor's language.
- Only discuss Value Charts, its features, pricing, and how to get started. For unrelated topics, politely steer back to the product.
- Never invent features, prices, or promises (no trials, no discounts, no roadmap promises). If you don't know, say so and suggest /contact.
- When pricing comes up, be precise about Pro being a $5 one-time lifetime purchase and the Team 5-seat minimum.`;

function toGeminiHistory(messages) {
  const rows = (messages || []).slice(-MAX_HISTORY);
  const history = [];
  for (const m of rows) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    history.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "").slice(0, 2000) }],
    });
  }
  while (history.length && history[0].role !== "user") history.shift();
  return history;
}

class PublicAssistantService {
  async chat({ messages }) {
    const history = toGeminiHistory(messages);
    if (!history.length) {
      throw new AppError("No user message provided", 400, "EMPTY_MESSAGE");
    }
    const lastMessage = history.pop();

    const model = getClient().getGenerativeModel({
      model: CHAT_MODEL,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.4,
      },
    });

    try {
      const chat = model.startChat({ history });
      const result = await chat.sendMessage(lastMessage.parts[0].text);
      const reply = result.response.text();
      return { reply };
    } catch (err) {
      logger.error(`[publicAssistant] Gemini error: ${err.message}`);
      throw new AppError(
        "The assistant is unavailable right now. Please try again shortly.",
        503,
        "AI_UNAVAILABLE",
      );
    }
  }
}

module.exports = new PublicAssistantService();
