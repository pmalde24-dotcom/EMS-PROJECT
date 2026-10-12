'use strict';
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
  static badRequest(m = 'Invalid request', d) { return new ApiError(400, m, d); }
  static unauthorized(m = 'Authentication required') { return new ApiError(401, m); }
  static forbidden(m = 'You do not have permission to perform this action') { return new ApiError(403, m); }
  static notFound(m = 'Resource not found') { return new ApiError(404, m); }
  static conflict(m = 'Resource already exists') { return new ApiError(409, m); }
  static tooMany(m = 'Too many requests') { return new ApiError(429, m); }
  static internal(m = 'Something went wrong') { return new ApiError(500, m); }
}
module.exports = ApiError;
