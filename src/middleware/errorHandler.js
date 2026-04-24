const logger = require("../utils/logger");
const AppError = require("../utils/AppError");

const errorHandler = (err, req, res, _next) => {
  const requestId = req.headers["x-request-id"] || "unknown";

  // Log full error details server-side
  logger.error(`${err.message}`, {
    requestId,
    method: req.method,
    url: req.originalUrl,
    statusCode: err.statusCode || 500,
    userId: req.user?.id,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });

  // Prisma known request errors
  if (err.code === "P2002") {
    const field = err.meta?.target?.[0] || "field";
    return res.status(409).json({
      success: false,
      error: {
        code: "CONFLICT",
        message: `A record with this ${field} already exists.`,
      },
    });
  }
  if (err.code === "P2025") {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Record not found." },
    });
  }
  if (err.code === "P2003") {
    return res.status(400).json({
      success: false,
      error: {
        code: "FOREIGN_KEY_ERROR",
        message: "Referenced record does not exist.",
      },
    });
  }

  // Multer errors (file upload)
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      error: {
        code: "FILE_TOO_LARGE",
        message: "File exceeds the maximum allowed size.",
      },
    });
  }
  if (err.code === "INVALID_FILE_TYPE") {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_FILE_TYPE", message: err.message },
    });
  }
  if (err.name === "MulterError") {
    return res.status(400).json({
      success: false,
      error: { code: "UPLOAD_ERROR", message: err.message },
    });
  }

  // Operational errors (AppError instances)
  if (err instanceof AppError) {
    const response = {
      success: false,
      error: { code: err.code, message: err.message },
    };
    if (err.details) response.error.details = err.details;
    if (err.retryAfter) res.setHeader("Retry-After", err.retryAfter);
    return res.status(err.statusCode).json(response);
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      error: {
        code: "INVALID_TOKEN",
        message: "Invalid authentication token.",
      },
    });
  }
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      error: {
        code: "TOKEN_EXPIRED",
        message: "Authentication token has expired.",
      },
    });
  }

  // Stripe errors
  if (err.type === "StripeSignatureVerificationError") {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_SIGNATURE",
        message: "Invalid webhook signature.",
      },
    });
  }

  // Default: internal server error — never leak details
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message:
        process.env.NODE_ENV === "production"
          ? "An unexpected error occurred."
          : err.message,
    },
  });
};

module.exports = errorHandler;
