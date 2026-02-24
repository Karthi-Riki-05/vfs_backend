const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

// Routes
const authRoutes = require('./src/routes/auth.routes');
const flowRoutes = require('./src/routes/flow.routes');
const shapeRoutes = require('./src/routes/shape.routes');
const shapeGroupRoutes = require('./src/routes/shapeGroup.routes');
const subscriptionRoutes = require('./src/routes/subscription.routes');
const openaiRoutes = require('./src/routes/openai.routes');

const app = express();
app.set('view engine', 'ejs');
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Status Page
app.get('/', (req, res) => {
    res.render('index', { version: '2.0.0' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/flows', flowRoutes);
app.use('/api/shapes', shapeRoutes);
app.use('/api/shape-groups', shapeGroupRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/openai', openaiRoutes);

/**
 * Helper function to parse AI text into structured JSON.
 */
function parseAISuggestion(text) {
    try {
        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/{[\s\S]*}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[1] || jsonMatch[0]);
        }
        return { error: "Could not find valid JSON in AI response", raw: text };
    } catch (e) {
        return { error: "Failed to parse AI response as JSON", raw: text };
    }
}

app.post('/api/ai/generate-diagram', async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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

        res.json({ diagramCode: text, structuredData: diagramData });
    } catch (error) {
        console.error("AI Processing Failed:", error);
        res.status(500).json({ error: "AI Processing Failed", details: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
