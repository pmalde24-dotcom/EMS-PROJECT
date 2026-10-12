'use strict';
const express = require('express');
const { requirePermission, authenticate } = require('../middleware/auth');
const { ALL_PERMISSIONS, ROLE_PERMISSIONS, ROLE_LIST, ROLE_LABELS, MODULES, ROLES } = require('../config/constants');

const router = express.Router();

/**
 * Global authentication guard.
 * Every /api route requires a valid access token except the explicitly public ones
 * (login, refresh, password reset, setup, public branding, health).
 * Individual routes additionally enforce fine-grained permissions.
 */
const PUBLIC_PATHS = ['/health', '/auth', '/settings/public'];
router.use((req, res, next) => {
  const isPublic = PUBLIC_PATHS.some((p) => req.path === p || req.path.startsWith(`${p}/`));
  if (isPublic) return next();
  return authenticate(req, res, next);
});

/* Health check (no auth) */
router.get('/health', (req, res) => res.json({
  success: true, message: 'EMS API is running', data: { uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() },
}));

/* Public: permission catalogue for the current user's role (used by the UI to hide/disable actions) */
router.get('/my-permissions', authenticate, async (req, res) => {
  res.json({ success: true, message: 'OK', data: { role: req.user.role, roleLabel: ROLE_LABELS[req.user.role], permissions: req.permissions } });
});

router.get('/rbac/catalog', authenticate, (req, res) => {
  res.json({ success: true, message: 'OK', data: { modules: MODULES, permissions: ALL_PERMISSIONS, roles: ROLE_LIST.map((k) => ({ key: k, label: ROLE_LABELS[k], permissionCount: (ROLE_PERMISSIONS[k] || []).length })) } });
});

const mounts = [
  ['/auth', () => require('./auth.routes')],
  ['/users', () => require('./user.routes')],
  ['/employees', () => require('./employee.routes')],
  ['/departments', () => require('./department.routes')],
  ['/designations', () => require('./designation.routes')],
  ['/shifts', () => require('./shift.routes')],
  ['/holidays', () => require('./holiday.routes')],
  ['/attendance', () => require('./attendance.routes')],
  ['/leave', () => require('./leave.routes')],
  ['/leave/types', () => require('./leaveType.routes')],
  ['/payroll', () => require('./payroll.routes')],
  ['/reimbursements', () => require('./reimbursement.routes')],
  ['/recruitment', () => require('./recruitment.routes')],
  ['/onboarding', () => require('./onboarding.routes')],
  ['/offboarding', () => require('./offboarding.routes')],
  ['/projects', () => require('./project.routes')],
  ['/tasks', () => require('./task.routes')],
  ['/timesheets', () => require('./timesheet.routes')],
  ['/performance', () => require('./performance.routes')],
  ['/training', () => require('./training.routes')],
  ['/assets', () => require('./asset.routes')],
  ['/announcements', () => require('./announcement.routes')],
  ['/notifications', () => require('./notification.routes')],
  ['/reports', () => require('./report.routes')],
  ['/dashboard', () => require('./dashboard.routes')],
  ['/settings', () => require('./settings.routes')],
  ['/audit', () => require('./audit.routes')],
  ['/uploads', () => require('./upload.routes')],
];
mounts.forEach(([path, loader]) => router.use(path, loader()));
void requirePermission; void ROLES;

module.exports = router;
