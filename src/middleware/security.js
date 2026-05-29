const helmet = require("helmet");
const hpp = require("hpp");

const securityMiddleware = (app) => {
  // Disable x-powered-by
  app.disable("x-powered-by");

  // Trust first proxy (Nginx) so x-forwarded-proto is respected
  app.set("trust proxy", 1);

  // Helmet security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // HTTP parameter pollution protection
  app.use(hpp());

  // HTTPS enforcement in production.
  // Only redirect when x-forwarded-proto is explicitly set to a non-https value.
  // Requests without this header are internal Docker calls (e.g. vc-frontend →
  // vc-backend) that never pass through Nginx/CloudFront — they must be allowed
  // through on plain HTTP or they hit ECONNREFUSED on port 443.
  if (process.env.NODE_ENV === "production") {
    app.use((req, res, next) => {
      const proto = req.headers["x-forwarded-proto"];
      if (proto && proto !== "https") {
        return res.redirect(301, `https://${req.hostname}${req.url}`);
      }
      next();
    });
  }
};

module.exports = securityMiddleware;
