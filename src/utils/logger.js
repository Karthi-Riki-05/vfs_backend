const winston = require('winston');

const sensitiveFields = ['password', 'token', 'apiKey', 'authorization', 'cookie', 'secret'];

const redactSensitive = winston.format((info) => {
    if (info.meta && typeof info.meta === 'object') {
        for (const key of Object.keys(info.meta)) {
            if (sensitiveFields.some(f => key.toLowerCase().includes(f))) {
                info.meta[key] = '[REDACTED]';
            }
        }
    }
    return info;
});

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        redactSensitive(),
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        process.env.NODE_ENV === 'production'
            ? winston.format.json()
            : winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
                    let log = `${timestamp} [${level}]: ${message}`;
                    if (stack) log += `\n${stack}`;
                    if (Object.keys(meta).length > 0) log += ` ${JSON.stringify(meta)}`;
                    return log;
                })
            )
    ),
    transports: [
        new winston.transports.Console(),
        ...(process.env.NODE_ENV === 'production'
            ? [
                new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
                new winston.transports.File({ filename: 'logs/combined.log' }),
            ]
            : []),
    ],
});

module.exports = logger;
