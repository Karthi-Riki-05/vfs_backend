const { z } = require('zod');

const generateDiagramSchema = z.object({
    body: z.object({
        prompt: z.string().min(1, 'Prompt is required').max(10000),
    }),
});

module.exports = { generateDiagramSchema };
