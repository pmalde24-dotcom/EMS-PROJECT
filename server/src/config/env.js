'use strict';
require('dotenv').config();

const bool = (v, d = false) => (v === undefined || v === '' ? d : String(v).toLowerCase() === 'true');
const int = (v, d) => (v === undefined || v === '' ? d : parseInt(v, 10));

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: int(process.env.PORT, 4000),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  MONGODB_URI: process.env.MONGODB_URI || '',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_me',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_me',
  JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL || '30m',
  JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL || '14d',
  COOKIE_SECURE: bool(process.env.COOKIE_SECURE, false),
  // production માં પણ in-memory demo mode ની છૂટ (Render free tier જેવા ટેસ્ટ-ડિપ્લોય માટે)
  ALLOW_DEMO_MODE: bool(process.env.ALLOW_DEMO_MODE, false),
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || undefined,
  CLOUDINARY: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
    api_key: process.env.CLOUDINARY_API_KEY || '',
    api_secret: process.env.CLOUDINARY_API_SECRET || '',
  },
  SMTP: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'EMS <no-reply@company.com>',
  },
  SEED: {
    email: process.env.SEED_SUPER_ADMIN_EMAIL || 'superadmin@company.com',
    password: process.env.SEED_SUPER_ADMIN_PASSWORD || 'SuperAdmin@123',
    demo: bool(process.env.SEED_DEMO_DATA, true),
  },
  isProd: (process.env.NODE_ENV || 'development') === 'production',
};

env.cloudinaryEnabled = !!(env.CLOUDINARY.cloud_name && env.CLOUDINARY.api_key && env.CLOUDINARY.api_secret);
env.smtpEnabled = !!(env.SMTP.host && env.SMTP.user);

module.exports = env;
