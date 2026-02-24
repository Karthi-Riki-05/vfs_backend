// Service for OpenAI proxy
const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

exports.proxy = async (body) => {
    if (!process.env.OPENAI_API_KEY) {
        const err = new Error('OpenAI API key not configured');
        err.status = 500;
        throw err;
    }
    console.log(process.env.OPENAI_API_KEY,'------------------');
    try {
        if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
            const err = new Error('Invalid request: messages array is required');
            err.status = 400;
            throw err;
        }

        console.log(body);
        const model = body.model || 'gpt-4';

        const completion = await openai.chat.completions.create({
            model,
            messages: body.messages,
        });

        // AI தரும் மூலத் தரவு (Raw content)
        let rawContent = completion.choices[0].message.content;

        // 1. Markdown குறியீடுகளை (```xml மற்றும் ```) நீக்குதல்
        // 2. தொடக்கத்தில் அல்லது இறுதியில் உள்ள தேவையற்ற இடைவெளிகளை நீக்குதல்
        const cleanContent = rawContent.replace(/```xml|```/g, "").trim();

        // சுத்தமான XML-ஐ மட்டும் திருப்பி அனுப்புகிறோம்
        return { content: cleanContent };
    } catch (error) {
        if (error.status === 401) {
            const err = new Error('Invalid API key');
            err.status = 401;
            throw err;
        } else if (error.status === 429) {
            const err = new Error('Rate limit exceeded');
            err.status = 429;
            throw err;
        } else if (error.status === 400) {
            const err = new Error('Invalid request to OpenAI API');
            err.status = 400;
            throw err;
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            const err = new Error('Network error');
            err.status = 500;
            throw err;
        }
        const err = new Error('Internal server error');
        err.status = 500;
        throw err;
    }
};
