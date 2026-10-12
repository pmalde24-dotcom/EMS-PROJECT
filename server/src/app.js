'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error');
const { apiLimiter } = require('./middleware/rateLimit');

const app = express();
app.set('trust proxy', 1);

/* ── Security headers ─────────────────────────────────────────────── */
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow images/docs to load from the API origin
  contentSecurityPolicy: false, // API only — the SPA sets its own CSP
  referrerPolicy: { policy: 'no-referrer' },
}));

/* ── CORS: allow the SPA origin(s) + same-origin/proxy previews ──── */
const allowedOrigins = env.CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    // same-origin requests, server-to-server calls and the proxy preview send no Origin
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return cb(null, true);
    // localhost / LAN dev ports + e2b preview hosts
    try {
      const { hostname, protocol } = new URL(origin);
      if (protocol !== 'http:' && protocol !== 'https:') return cb(null, false);
      const isLocal = ['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname) || /^192\.168\.\d+\.\d+$/.test(hostname) || /^10\.\d+\.\d+\.\d+$/.test(hostname);
      const isPreview = /\.e2b\.app$/.test(hostname) || /\.arena\.(ai|dev)$/.test(hostname)
        || hostname.endsWith('.ngrok-free.app') || hostname.endsWith('.onrender.com') || hostname.endsWith('.vercel.app');
      return cb(null, isLocal || isPreview);
    } catch { return cb(null, false); }
  },
  credentials: true,
  exposedHeaders: ['Content-Disposition', 'X-Total-Count'],
}));

/* ── Body parsing & hygiene ──────────────────────────────────────── */
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());
app.use(compression());
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(hpp());
if (!env.isProd) app.use(morgan('dev'));

/* ── Static uploads (only non-sensitive folders are public) ─────── */
app.use('/uploads/photos', express.static(path.join(__dirname, '..', 'uploads', 'photos'), { maxAge: '1d' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), { index: false, dotfiles: 'deny' }));

/* ── API ─────────────────────────────────────────────────────────── */
app.use('/api', apiLimiter, routes);

/* ── Built frontend (single-service deploy: frontend + API એક જ URL પર) ── */
const fs = require('fs');
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist');
const spaIndex = path.join(CLIENT_DIST, 'index.html');
const hasSpa = fs.existsSync(spaIndex);
if (hasSpa) {
  app.use(express.static(CLIENT_DIST, {
    index: false,
    maxAge: '7d',
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html') || filePath.endsWith('config.js')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  // SPA fallback — /login, /dashboard વગેરે બધા client-side રૂટ index.html આપે (404 → સફેદ પાનું નહીં)
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    if (!req.accepts('html')) return next();
    return res.sendFile(spaIndex);
  });
}

/* ── Root + 404 + errors ─────────────────────────────────────────── */
if (!hasSpa) {
  app.get('/', (req, res) => res.json({ success: true, message: 'EMS API', data: { docs: '/api/health', version: '1.0.0' } }));
}
app.use(notFound);
app.use(errorHandler);

module.exports = app;
