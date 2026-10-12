'use strict';
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

const signAccessToken = (payload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL, issuer: 'ems' });

const signRefreshToken = (payload) =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_TTL, issuer: 'ems' });

const verifyAccessToken = (token) => jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'ems' });
const verifyRefreshToken = (token) => jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: 'ems' });

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, sha256, randomToken };
