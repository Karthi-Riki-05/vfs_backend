const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Value Charts API',
            version: '1.0.0',
            description: 'Backend API for Value Charts 2.0 — flowchart and diagram management platform.',
            contact: {
                name: 'Value Charts Team',
            },
        },
        servers: [
            {
                url: process.env.BACKEND_URL || 'http://localhost:5000',
                description: 'API Server',
            },
        ],
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        error: {
                            type: 'object',
                            properties: {
                                code: { type: 'string' },
                                message: { type: 'string' },
                            },
                        },
                    },
                },
                ValidationError: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        error: {
                            type: 'object',
                            properties: {
                                code: { type: 'string', example: 'VALIDATION_ERROR' },
                                message: { type: 'string', example: 'Invalid request data' },
                                details: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            field: { type: 'string' },
                                            message: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        tags: [
            { name: 'Auth', description: 'Authentication endpoints' },
            { name: 'Users', description: 'User profile management' },
            { name: 'Flows', description: 'Flow/diagram management' },
            { name: 'Shapes', description: 'Shape management' },
            { name: 'Shape Groups', description: 'Shape group management' },
            { name: 'Teams', description: 'Team management' },
            { name: 'Chat', description: 'Chat and messaging' },
            { name: 'Issues', description: 'Issue tracking on flows' },
            { name: 'Subscription', description: 'Subscription and plan management' },
            { name: 'Payments', description: 'Stripe payments and transactions' },
            { name: 'Admin', description: 'Admin panel endpoints' },
            { name: 'AI', description: 'AI-powered features' },
        ],
    },
    apis: ['./src/routes/*.js', './index.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
