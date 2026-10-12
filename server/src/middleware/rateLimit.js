'use strict';
const rateLimit = require('express-rate-limit');

const jsonHandler = (msg) => (req, res) => res.status(429).json({ success: false, message: msg });

/** Brute-force protection for login / password reset endpoints. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: jsonHandler('Too many authentication attempts. Please try again in 15 minutes.'),
});

const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  handler: jsonHandler('Too many password requests. Try again later.'),
});

/** Global API limiter (generous for dashboards that poll data). */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler('Too many requests. Please slow down.'),
});

module.exports = { authLimiter, passwordLimiter, apiLimiter };
