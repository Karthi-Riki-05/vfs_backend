const openaiService = require('../services/openai.service');
const asyncHandler = require('../utils/asyncHandler');

exports.proxy = asyncHandler(async (req, res) => {
    const result = await openaiService.proxy(req.body);
    res.json({ success: true, data: result });
});
