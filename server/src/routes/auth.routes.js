'use strict';
const express = require('express');
const { z } = require('zod');
const { User, RefreshToken } = require('../models');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { authLimiter, passwordLimiter } = require('../middleware/rateLimit');
const { signAccessToken, signRefreshToken, verifyRefreshToken, sha256, randomToken } = require('../utils/jwt');
const { recordAudit } = require('../utils/audit');
const { sendMail, layout } = require('../utils/mailer');
const { resolvePermissions } = require('../utils/permissions');

const router = express.Router();

const strongPassword = z.string().min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Must contain an uppercase letter')
  .regex(/[a-z]/, 'Must contain a lowercase letter')
  .regex(/\d/, 'Must contain a number')
  .regex(/[^A-Za-z0-9]/, 'Must contain a special character');

const cookieOpts = (maxAgeMs) => ({
  httpOnly: true, secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SECURE ? 'none' : 'lax',
  domain: env.COOKIE_DOMAIN, path: '/', maxAge: maxAgeMs,
});

const DAY = 24 * 60 * 60 * 1000;

async function issueTokens(req, res, user) {
  const payload = { sub: String(user._id), role: user.role, emp: user.employee ? String(user.employee._id || user.employee) : null };
  const accessToken = signAccessToken(payload);
  const family = randomToken(16);
  const refreshToken = signRefreshToken({ sub: String(user._id), fam: family });
  await RefreshToken.create({
    user: user._id, tokenHash: sha256(refreshToken), family,
    expiresAt: new Date(Date.now() + 14 * DAY),
    ip: req.ip, userAgent: (req.headers['user-agent'] || '').slice(0, 200),
  });
  res.cookie('accessToken', accessToken, cookieOpts(30 * 60 * 1000));
  res.cookie('refreshToken', refreshToken, cookieOpts(14 * DAY));
  return { accessToken, refreshToken, expiresIn: env.JWT_ACCESS_TTL };
}

const publicUser = async (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  isEmailVerified: user.isEmailVerified,
  employee: user.employee,
  notificationPrefs: user.notificationPrefs,
  lastLoginAt: user.lastLoginAt,
  permissions: await resolvePermissions(user),
});

/** POST /api/auth/setup — one-time Super Admin bootstrap (only when no user exists). */
router.post('/setup', authLimiter, validate({ body: z.object({ name: z.string().min(2), email: z.string().email(), password: strongPassword }) }),
  asyncHandler(async (req, res) => {
    const count = await User.countDocuments({ deletedAt: null });
    if (count > 0) throw ApiError.forbidden('Setup already completed. Please sign in.');
    const user = await User.create({ ...req.body, role: 'super_admin', isEmailVerified: true });
    const tokens = await issueTokens(req, res, user);
    await recordAudit(req, { action: 'auth.setup', module: 'users', targetModel: 'User', targetId: user._id, description: 'Initial Super Admin account created', severity: 'critical' });
    return respond.created(res, { user: await publicUser(user), ...tokens }, 'Super Admin account created');
  })
);

/** GET /api/auth/setup-status — tells the client whether first-time setup is needed. */
router.get('/setup-status', asyncHandler(async (req, res) => {
  const count = await User.countDocuments({ deletedAt: null });
  return respond.ok(res, { needsSetup: count === 0 });
}));

/** POST /api/auth/login */
router.post('/login', authLimiter, validate({ body: z.object({ email: z.string().email('Valid email is required'), password: z.string().min(1, 'Password is required'), remember: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findByCredentials(email);
    const fail = async (reason, status = 401) => {
      if (user) {
        user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
        if (user.failedLoginAttempts >= 5) user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        user.loginActivity = user.loginActivity || [];
        user.loginActivity.push({ ip: req.ip, userAgent: (req.headers['user-agent'] || '').slice(0, 200), success: false, reason });
        await user.save({ validateBeforeSave: false });
      }
      await recordAudit(req, { action: 'auth.login_failed', module: 'users', description: `Failed login for ${email} (${reason})`, severity: 'warning' });
      throw new ApiError(status, reason === 'locked' ? 'Account locked for 15 minutes due to failed attempts.' : 'Invalid email or password.');
    };

    if (!user) return fail('unknown_email');
    if (user.isLocked()) return fail('locked', 423);
    if (user.deletedAt) return fail('deleted');

    const ok = await user.comparePassword(password);
    if (!ok) return fail('bad_password');
    if (!user.isActive) return fail('inactive', 403);

    user.failedLoginAttempts = 0; user.lockedUntil = undefined;
    user.lastLoginAt = new Date(); user.loginCount = (user.loginCount || 0) + 1;
    user.loginActivity = user.loginActivity || [];
    user.loginActivity.push({ ip: req.ip, userAgent: (req.headers['user-agent'] || '').slice(0, 200), success: true });
    if (user.loginActivity.length > 25) user.loginActivity = user.loginActivity.slice(-25);
    await user.save({ validateBeforeSave: false });

    const tokens = await issueTokens(req, res, user);
    await recordAudit(req, { action: 'auth.login', module: 'users', targetModel: 'User', targetId: user._id, description: `${user.name} signed in` });
    return respond.ok(res, { user: await publicUser(user), ...tokens }, 'Signed in successfully');
  })
);

/** POST /api/auth/refresh — refresh-token rotation with reuse detection. */
router.post('/refresh', asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) throw ApiError.unauthorized('Refresh token missing');
  let payload;
  try { payload = verifyRefreshToken(token); } catch { throw ApiError.unauthorized('Refresh token expired or invalid'); }

  const stored = await RefreshToken.findOne({ tokenHash: sha256(token) });
  if (!stored) throw ApiError.unauthorized('Refresh token not recognised');
  if (stored.revokedAt) {
    // Reuse of a rotated token → revoke the whole family (possible theft).
    await RefreshToken.updateMany({ family: stored.family, revokedAt: null }, { revokedAt: new Date() });
    throw ApiError.unauthorized('Refresh token reuse detected. All sessions revoked. Please sign in again.');
  }
  if (stored.expiresAt < new Date()) throw ApiError.unauthorized('Session expired. Please sign in again.');

  const user = await User.findById(payload.sub).populate('employee', 'firstName lastName employeeId department designation');
  if (!user || !user.isActive) throw ApiError.unauthorized('Account is not active');

  const accessToken = signAccessToken({ sub: String(user._id), role: user.role, emp: user.employee?._id });
  const newRefresh = signRefreshToken({ sub: String(user._id), fam: stored.family });
  stored.revokedAt = new Date();
  stored.replacedBy = sha256(newRefresh);
  await stored.save();
  await RefreshToken.create({ user: user._id, tokenHash: sha256(newRefresh), family: stored.family, expiresAt: new Date(Date.now() + 14 * DAY), ip: req.ip });
  res.cookie('accessToken', accessToken, cookieOpts(30 * 60 * 1000));
  res.cookie('refreshToken', newRefresh, cookieOpts(14 * DAY));
  return respond.ok(res, { accessToken, refreshToken: newRefresh, user: await publicUser(user) }, 'Session refreshed');
}));

/** GET /api/auth/me */
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('employee', 'firstName lastName employeeId department designation profilePhoto workLocation');
  return respond.ok(res, await publicUser(user));
}));

/** POST /api/auth/logout */
router.post('/logout', asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (token) await RefreshToken.updateOne({ tokenHash: sha256(token) }, { revokedAt: new Date() });
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });
  if (req.cookies?.accessToken) await recordAudit(req, { action: 'auth.logout', module: 'users', description: 'User signed out' });
  return respond.ok(res, null, 'Signed out');
}));

/** POST /api/auth/logout-all — revoke every session/device. */
router.post('/logout-all', authenticate, asyncHandler(async (req, res) => {
  await RefreshToken.updateMany({ user: req.user._id, revokedAt: null }, { revokedAt: new Date() });
  res.clearCookie('accessToken', { path: '/' }); res.clearCookie('refreshToken', { path: '/' });
  await recordAudit(req, { action: 'auth.logout_all', module: 'users', description: 'Signed out from all devices', severity: 'warning' });
  return respond.ok(res, null, 'Signed out from all devices');
}));

/** POST /api/auth/change-password */
router.post('/change-password', authenticate, validate({ body: z.object({ currentPassword: z.string().min(1), newPassword: strongPassword }) }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(req.body.currentPassword))) throw ApiError.badRequest('Current password is incorrect');
    user.password = req.body.newPassword;
    await user.save();
    await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
    await recordAudit(req, { action: 'auth.password_changed', module: 'users', targetId: user._id, description: 'Password changed', severity: 'warning' });
    res.clearCookie('accessToken', { path: '/' }); res.clearCookie('refreshToken', { path: '/' });
    return respond.ok(res, null, 'Password changed. Please sign in again with your new password.');
  })
);

/** POST /api/auth/forgot-password */
router.post('/forgot-password', passwordLimiter, validate({ body: z.object({ email: z.string().email() }) }),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email.toLowerCase(), deletedAt: null });
    if (user) {
      const token = randomToken(32);
      user.passwordResetToken = sha256(token);
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save({ validateBeforeSave: false });
      const link = `${env.CLIENT_ORIGIN}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
      await sendMail({
        to: user.email, subject: 'Reset your EMS password',
        html: layout('Password reset', `<p>Hi ${user.name},</p><p>Click the link below to reset your password. This link expires in 60 minutes.</p><p><a href="${link}">${link}</a></p><p>If you did not request this, please ignore this email.</p>`),
      });
      await recordAudit(req, { action: 'auth.forgot_password', module: 'users', targetId: user._id, description: 'Password reset requested' });
      if (env.NODE_ENV !== 'production') return respond.ok(res, { devResetToken: token }, 'Reset link generated (dev mode returns token when SMTP is not configured)');
    }
    return respond.ok(res, null, 'If an account exists for that email, a reset link has been sent.');
  })
);

/** POST /api/auth/reset-password */
router.post('/reset-password', passwordLimiter, validate({ body: z.object({ token: z.string().min(10), password: strongPassword }) }),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ passwordResetToken: sha256(req.body.token), passwordResetExpires: { $gt: new Date() } }).select('+password');
    if (!user) throw ApiError.badRequest('Reset link is invalid or has expired');
    user.password = req.body.password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    await user.save();
    await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
    await recordAudit(req, { action: 'auth.reset_password', module: 'users', targetId: user._id, description: 'Password reset completed', severity: 'warning' });
    return respond.ok(res, null, 'Password reset successful. Please sign in.');
  })
);

/** GET /api/auth/activity — login history + active sessions for the current user. */
router.get('/activity', authenticate, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+loginActivity');
  const sessions = await RefreshToken.find({ user: req.user._id, revokedAt: null, expiresAt: { $gt: new Date() } })
    .select('ip userAgent createdAt expiresAt').sort('-createdAt').limit(20).lean();
  return respond.ok(res, { loginActivity: (user.loginActivity || []).slice().reverse().slice(0, 25), activeSessions: sessions });
}));

/** PATCH /api/auth/preferences — notification preferences. */
router.patch('/preferences', authenticate, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  user.notificationPrefs = { ...user.notificationPrefs.toObject?.() ?? user.notificationPrefs, ...req.body };
  await user.save({ validateBeforeSave: false });
  return respond.ok(res, { notificationPrefs: user.notificationPrefs }, 'Preferences saved');
}));

/** POST /api/auth/verify-email */
router.post('/verify-email', validate({ body: z.object({ token: z.string().min(10) }) }), asyncHandler(async (req, res) => {
  const user = await User.findOne({ emailVerifyToken: sha256(req.body.token) }).select('+emailVerifyToken');
  if (!user) throw ApiError.badRequest('Verification link is invalid or already used');
  user.isEmailVerified = true; user.emailVerifyToken = undefined;
  await user.save({ validateBeforeSave: false });
  return respond.ok(res, null, 'Email verified successfully');
}));

module.exports = router;
