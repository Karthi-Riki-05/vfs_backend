const AppError = require('../utils/AppError');

class ValidationError extends AppError {
    constructor(message = 'Validation failed', details = []) {
        super(message, 400, 'VALIDATION_ERROR');
        this.details = details;
    }
}

class AuthenticationError extends AppError {
    constructor(message = 'Authentication required') {
        super(message, 401, 'UNAUTHORIZED');
    }
}

class AuthorizationError extends AppError {
    constructor(message = 'Insufficient permissions') {
        super(message, 403, 'FORBIDDEN');
    }
}

class NotFoundError extends AppError {
    constructor(resource = 'Resource') {
        super(`${resource} not found`, 404, 'NOT_FOUND');
    }
}

class ConflictError extends AppError {
    constructor(message = 'Resource already exists') {
        super(message, 409, 'CONFLICT');
    }
}

class RateLimitError extends AppError {
    constructor(retryAfter = 60) {
        super('Too many requests. Please try again later.', 429, 'RATE_LIMITED');
        this.retryAfter = retryAfter;
    }
}

module.exports = {
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    RateLimitError,
};
