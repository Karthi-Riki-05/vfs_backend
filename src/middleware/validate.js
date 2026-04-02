const { ZodError } = require('zod');

const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    const dangerous = ['__proto__', 'constructor', 'prototype'];
    const sanitized = Array.isArray(obj) ? [] : {};
    for (const [key, value] of Object.entries(obj)) {
        if (dangerous.includes(key)) continue;
        sanitized[key] = typeof value === 'object' && value !== null ? sanitizeObject(value) : value;
    }
    return sanitized;
};

const validate = (schema) => (req, res, next) => {
    try {
        // Sanitize inputs before validation
        if (req.body) req.body = sanitizeObject(req.body);
        if (req.query) req.query = sanitizeObject(req.query);
        if (req.params) req.params = sanitizeObject(req.params);

        const result = schema.parse({
            body: req.body,
            query: req.query,
            params: req.params,
        });

        // Replace with validated/transformed data
        req.body = result.body ?? req.body;
        req.query = result.query ?? req.query;
        req.params = result.params ?? req.params;

        next();
    } catch (error) {
        if (error instanceof ZodError) {
            const issues = error.issues || [];
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid request data',
                    details: issues.map(e => ({
                        field: (e.path || []).join('.'),
                        message: e.message,
                    })),
                },
            });
        }
        next(error);
    }
};

module.exports = validate;
