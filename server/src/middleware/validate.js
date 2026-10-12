'use strict';
const ApiError = require('../utils/ApiError');

/**
 * Zod validation middleware.
 * validate({ body, query, params }) — each schema may be partial/optional.
 */
const validate = (schemas = {}) => (req, res, next) => {
  try {
    ['body', 'query', 'params'].forEach((key) => {
      if (!schemas[key]) return;
      const result = schemas[key].safeParse(req[key]);
      if (!result.success) {
        const details = result.error.issues.map((i) => ({ field: i.path.join('.') || key, message: i.message }));
        throw ApiError.badRequest(`${key === 'body' ? 'Validation' : key} error`, details);
      }
      if (key === 'body') req.body = result.data;
      else if (key === 'query') req.validatedQuery = result.data;
      else Object.assign(req.params, result.data);
    });
    next();
  } catch (e) {
    next(e);
  }
};
module.exports = validate;
