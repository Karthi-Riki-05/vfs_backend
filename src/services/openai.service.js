const OpenAI = require('openai');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

exports.proxy = async (body) => {
    if (!process.env.OPENAI_API_KEY) {
        throw new AppError('OpenAI API key not configured', 500, 'OPENAI_NOT_CONFIGURED');
    }

    try {
        const model = body.model || 'gpt-4';

        const completion = await openai.chat.completions.create({
            model,
            messages: body.messages,
        });

        let rawContent = completion.choices[0].message.content;
        const cleanContent = rawContent.replace(/```xml|```/g, '').trim();

        return { content: cleanContent };
    } catch (error) {
        logger.error('OpenAI API error', { status: error.status, code: error.code });

        if (error.status === 401) {
            throw new AppError('Invalid API key', 401, 'OPENAI_AUTH_ERROR');
        } else if (error.status === 429) {
            throw new AppError('Rate limit exceeded', 429, 'OPENAI_RATE_LIMIT');
        } else if (error.status === 400) {
            throw new AppError('Invalid request to OpenAI API', 400, 'OPENAI_BAD_REQUEST');
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            throw new AppError('Network error', 500, 'NETWORK_ERROR');
        }
        throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
};
