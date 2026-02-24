// Controller for OpenAI proxy
const openaiService = require('../services/openai.service');

exports.proxy = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
        const result = await openaiService.proxy(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
