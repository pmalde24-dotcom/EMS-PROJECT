'use strict';
const express = require('express');
const { z } = require('zod');
const { CompanySettings, Role, Department, Designation, LeaveType, Shift, OnboardingTemplate, PerformanceTemplate, User, Employee } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const validate = require('../middleware/validate');
const { requirePermission, authorize } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');
const { invalidateRoleCache } = require('../utils/permissions');
const { fileUploader, persistFile, ALLOWED } = require('../utils/upload');

const router = express.Router();

/** Returns the singleton settings document, creating it if needed. */
async function getSettings() {
  let s = await CompanySettings.findOne({ singleton: 'company' });
  if (!s) s = await CompanySettings.create({ singleton: 'company' });
  return s;
}

router.get('/', requirePermission('settings:view'), asyncHandler(async (req, res) => {
  const settings = await getSettings();
  let data = settings.toObject();
  // Non-admin roles get a trimmed, non-sensitive view
  if (!['super_admin', 'hr_admin'].includes(req.user.role)) {
    const { payrollSettings, ...rest } = data;
    data = { ...rest, payrollSettings: payrollSettings ? { payDay: payrollSettings.payDay, workingDaysPerMonth: payrollSettings.workingDaysPerMonth } : undefined };
  }
  return respond.ok(res, data);
}));

/** Public subset used for branding on the login page (no auth). */
router.get('/public', asyncHandler(async (req, res) => {
  const s = await getSettings();
  return respond.ok(res, {
    name: s.name, logo: s.logo, timezone: s.timezone, currency: s.currency, currencySymbol: s.currencySymbol,
    address: s.address, contact: { email: s.email, phone: s.phone }, workingDays: s.workingDays, workingHours: s.workingHours,
    dateFormat: s.dateFormat, timeFormat: s.timeFormat,
  });
}));

const settingsSchema = z.record(z.any());

router.patch('/', requirePermission('settings:update'), authorize('super_admin', 'hr_admin'), validate({ body: settingsSchema }), asyncHandler(async (req, res) => {
  const settings = await getSettings();
  const before = settings.toObject();
  const protectedKeys = ['_id', 'singleton', 'createdAt', 'updatedAt', '__v'];
  const payload = { ...req.body };
  protectedKeys.forEach((k) => delete payload[k]);

  // Deep-merge nested policy objects so partial updates don't wipe values
  ['attendancePolicy', 'leavePolicy', 'payrollSettings', 'notificationSettings', 'dataRetention', 'workingHours', 'address', 'documentTemplates'].forEach((key) => {
    if (payload[key] && typeof payload[key] === 'object' && !Array.isArray(payload[key])) {
      payload[key] = { ...(settings[key]?.toObject?.() ?? settings[key] ?? {}), ...payload[key] };
    }
  });
  Object.assign(settings, payload);
  await settings.save();
  await recordAudit(req, {
    action: 'settings.update', module: 'settings', targetModel: 'CompanySettings', targetId: settings._id,
    description: `Company settings updated (${Object.keys(payload).join(', ')})`,
    metadata: { keys: Object.keys(payload), before: { name: before.name, timezone: before.timezone }, after: { name: settings.name, timezone: settings.timezone } },
    severity: 'critical',
  });
  return respond.ok(res, settings, 'Settings saved successfully');
}));

/* ── Company logo ─────────────────────────────────────────────────── */
router.post('/logo', requirePermission('settings:update'), authorize('super_admin', 'hr_admin'), fileUploader({ types: ALLOWED.image, maxSizeMB: 2, field: 'logo' }), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Please choose a logo image (JPEG/PNG/WebP, max 2 MB)' });
  const meta = await persistFile(req.file);
  const settings = await getSettings();
  settings.logo = { url: meta.url, publicId: meta.publicId };
  await settings.save();
  return respond.ok(res, settings.logo, 'Logo updated');
}));

/* ── Role permission matrix ──────────────────────────────────────── */
router.get('/roles', requirePermission('roles:view'), asyncHandler(async (req, res) => {
  await Role.seedDefaults();
  const roles = await Role.find().sort('level').lean();
  return respond.ok(res, roles);
}));

router.patch('/roles/:key', authorize('super_admin'), validate({ body: z.object({
  permissions: z.array(z.string()).optional(), name: z.string().optional(), description: z.string().optional(),
  isActive: z.boolean().optional(), level: z.coerce.number().optional(),
}) }), asyncHandler(async (req, res) => {
  const role = await Role.findOne({ key: req.params.key });
  if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
  if (role.key === 'super_admin' && req.body.permissions && !req.body.permissions.includes('*')) {
    return res.status(400).json({ success: false, message: 'Super Admin must always retain full access (*)' });
  }
  Object.assign(role, req.body, { updatedBy: req.user._id });
  await role.save();
  invalidateRoleCache(role.key);
  await recordAudit(req, { action: 'settings.role_update', module: 'roles', targetId: role._id, description: `Updated role "${role.name}"`, metadata: { permissions: req.body.permissions?.length }, severity: 'critical' });
  return respond.ok(res, role, 'Role updated');
}));

/* ── Bootstrap / reference data ──────────────────────────────────── */
router.get('/reference-data', requirePermission('settings:view', 'dashboard:view'), asyncHandler(async (req, res) => {
  const [departments, designations, leaveTypes, shifts, roles, managers, templates, reviewTemplates] = await Promise.all([
    Department.find({ deletedAt: null, isActive: true }).select('name code').sort('name').lean(),
    Designation.find({ deletedAt: null, isActive: true }).select('title jobLevel department').sort('title').lean(),
    LeaveType.find({ isActive: true }).select('name code color annualQuota paid').sort('name').lean(),
    Shift.find({ isActive: true }).select('name startTime endTime').sort('name').lean(),
    Role.find().sort('level').select('key name level permissions').lean(),
    Employee.find({ deletedAt: null, isActive: true }).select('firstName lastName employeeId designation').sort('firstName').limit(500).lean(),
    OnboardingTemplate.find({ isActive: true }).select('name department isDefault tasks').lean(),
    PerformanceTemplate.find({ isActive: true }).select('name cycleType ratingScale competencies').lean(),
  ]);
  return respond.ok(res, { departments, designations, leaveTypes, shifts, roles, managers, onboardingTemplates: templates, reviewTemplates });
}));

/* ── System health / info ────────────────────────────────────────── */
router.get('/system', requirePermission('settings:view', 'audit:view'), asyncHandler(async (req, res) => {
  const mongoose = require('mongoose');
  const env = require('../config/env');
  const counts = await Promise.all([
    User.countDocuments(), Employee.countDocuments(), Department.countDocuments(),
  ]);
  return respond.ok(res, {
    database: { state: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', name: mongoose.connection.name, host: mongoose.connection.host, mode: env.MONGODB_URI ? 'atlas/uri' : 'in-memory demo' },
    integrations: { cloudinary: env.cloudinaryEnabled ? 'configured' : 'not configured (local uploads)', smtp: env.smtpEnabled ? 'configured' : 'not configured (console mail)' },
    counts: { users: counts[0], employees: counts[1], departments: counts[2] },
    node: process.version, uptimeSeconds: Math.round(process.uptime()), environment: env.NODE_ENV,
  });
}));

module.exports = router;
