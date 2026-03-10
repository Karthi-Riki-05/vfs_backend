const helmet = require('helmet');
const hpp = require('hpp');

const securityMiddleware = (app) => {
    // Disable x-powered-by
    app.disable('x-powered-by');

    // Trust first proxy (Nginx) so x-forwarded-proto is respected
    app.set('trust proxy', 1);

    // Helmet security headers
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'https:'],
            },
        },
        crossOriginEmbedderPolicy: false,
    }));


    // HTTP parameter pollution protection
    app.use(hpp());

    // HTTPS enforcement in production
    if (process.env.NODE_ENV === 'production') {
        app.use((req, res, next) => {
            if (req.headers['x-forwarded-proto'] !== 'https') {
                return res.redirect(301, `https://${req.hostname}${req.url}`);
            }
            next();
        });
    }
};

module.exports = securityMiddleware;
