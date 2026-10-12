'use strict';
const express = require('express');
const { z } = require('zod');
const { User, Role, Employee, RefreshToken, AuditLog } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const validate = require('../middleware/validate');
const { requirePermission, authorize } = require('../middleware/auth');
const { buildQuery, paginate } = require('../utils/query');
const { recordAudit } = require('../utils/audit');
const { invalidateRoleCache } = require('../utils/permissions');
const { ALL_PERMISSIONS, ROLE_LABELS, MODULES, ACTIONS } = require('../config/constants');

const router = express.Router();

/* ── Permission catalogue & role matrix (Super Admin / HR Admin) ──── */
router.get('/permissions/catalog', requirePermission('roles:view', 'settings:view'), (req, res) =>
  respond.ok(res, { modules: MODULES, actions: ACTIONS, permissions: ALL_PERMISSIONS })
);

router.get('/roles', requirePermission('roles:view', 'users:view'), asyncHandler(async (req, res) => {
  await Role.seedDefaults();
  const roles = await Role.find().sort('level').lean();
  const counts = await User.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$role', count: { $sum: 1 } } }]);
  const countMap = counts.reduce((a, c) => ({ ...a, [c._id]: c.count }), {});
  return respond.ok(res, roles.map((r) => ({ ...r, name: r.name || ROLE_LABELS[r.key], userCount: countMap[r.key] || 0 })));
}));

router.patch('/roles/:key/permissions', authorize('super_admin'), validate({ body: z.object({ permissions: z.array(z.string()) }) }),
  asyncHandler(async (req, res) => {
    const role = await Role.findOne({ key: req.params.key });
    if (!role) throw ApiError.notFound('Role not found');
    if (role.key === 'super_admin' && !req.body.permissions.includes('*')) throw ApiError.badRequest('Super Admin must retain full access (*)');
    role.permissions = req.body.permissions.length === ALL_PERMISSIONS.length ? ['*'] : req.body.permissions;
    role.updatedBy = req.user._id;
    await role.save();
    invalidateRoleCache(role.key);
    await recordAudit(req, { action: 'role.permissions_update', module: 'roles', targetModel: 'Role', targetId: role._id, description: `Updated permissions for role ${role.name} (${role.permissions.length} entries)`, severity: 'critical' });
    return respond.ok(res, role, 'Role permissions updated');
  })
);

/* ── USER MANAGEMENT ─────────────────────────────────────────────── */
router.get('/', requirePermission('users:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: ['name', 'email'], filterFields: ['role', 'isActive'], defaultSort: '-createdAt' });
  opts.filter.deletedAt = null;
  const { items, meta } = await paginate(User, opts, { populate: [{ path: 'employee', select: 'firstName lastName employeeId profilePhoto department designation' }] });
  const clean = items.map((u) => { const c = { ...u }; delete c.permissions; return c; });
  return respond.list(res, clean, meta);
}));

router.get('/:id', requirePermission('users:view'), asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).populate('employee', 'firstName lastName employeeId profilePhoto');
  if (!user) throw ApiError.notFound('User not found');
  return respond.ok(res, user);
}));

router.post('/', requirePermission('users:create'), validate({
  body: z.object({
    name: z.string().min(2), email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(['super_admin', 'hr_admin', 'hr_manager', 'department_manager', 'team_leader', 'employee']),
    employee: z.string().optional().nullable(), isActive: z.boolean().optional(), sendInvite: z.boolean().optional(),
  }),
}), asyncHandler(async (req, res) => {
  if (req.body.role === 'super_admin' && req.user.role !== 'super_admin') throw ApiError.forbidden('Only a Super Admin can create another Super Admin');
  const dup = await User.findOne({ email: req.body.email.toLowerCase() });
  if (dup) throw ApiError.conflict('A user with this email already exists');
  const user = await User.create(req.body);
  await recordAudit(req, { action: 'user.create', module: 'users', targetModel: 'User', targetId: user._id, description: `Created user ${user.email} with role ${user.role}`, severity: 'critical' });
  return respond.created(res, user, 'User created');
}));

router.patch('/:id', requirePermission('users:update'), asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  const body = { ...req.body };
  delete body.password;
  if (body.role === 'super_admin' && req.user.role !== 'super_admin') throw ApiError.forbidden('Only a Super Admin can assign the Super Admin role');
  if (user.role === 'super_admin' && body.role && body.role !== 'super_admin' && req.user.role !== 'super_admin') throw ApiError.forbidden('Cannot change a Super Admin role');
  Object.assign(user, body);
  await user.save();
  await recordAudit(req, { action: 'user.update', module: 'users', targetId: user._id, description: `Updated user ${user.email}`, metadata: { fields: Object.keys(body) }, severity: 'warning' });
  return respond.ok(res, user, 'User updated');
}));

router.post('/:id/toggle-active', requirePermission('users:update'), asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  if (String(user._id) === String(req.user._id)) throw ApiError.badRequest('You cannot deactivate your own account');
  user.isActive = !user.isActive;
  await user.save();
  if (!user.isActive) await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
  await recordAudit(req, { action: user.isActive ? 'user.activate' : 'user.deactivate', module: 'users', targetId: user._id, description: `${user.isActive ? 'Activated' : 'Deactivated'} user ${user.email}`, severity: 'critical' });
  return respond.ok(res, { isActive: user.isActive }, `User ${user.isActive ? 'activated' : 'deactivated'}`);
}));

router.post('/:id/permissions', authorize('super_admin', 'hr_admin'), validate({ body: z.object({ extraPermissions: z.array(z.string()).optional(), revokedPermissions: z.array(z.string()).optional() }) }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw ApiError.notFound('User not found');
    if (req.body.extraPermissions) user.extraPermissions = req.body.extraPermissions.filter((p) => ALL_PERMISSIONS.includes(p));
    if (req.body.revokedPermissions) user.revokedPermissions = req.body.revokedPermissions;
    await user.save();
    await recordAudit(req, { action: 'user.permissions_update', module: 'roles', targetId: user._id, description: `Updated per-user permission overrides for ${user.email}`, severity: 'critical' });
    return respond.ok(res, { extraPermissions: user.extraPermissions, revokedPermissions: user.revokedPermissions }, 'Permissions updated');
  })
);

router.post('/:id/revoke-sessions', requirePermission('users:update'), asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
  await recordAudit(req, { action: 'user.revoke_sessions', module: 'users', targetId: user._id, description: `Revoked all sessions for ${user.email}`, severity: 'warning' });
  return respond.ok(res, null, 'All sessions revoked for this user');
}));

router.delete('/:id', requirePermission('users:delete'), authorize('super_admin'), asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  if (String(user._id) === String(req.user._id)) throw ApiError.badRequest('You cannot delete your own account');
  user.deletedAt = new Date(); user.isActive = false;
  await user.save();
  await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
  await recordAudit(req, { action: 'user.delete', module: 'users', targetId: user._id, description: `Deleted user ${user.email}`, severity: 'critical' });
  return respond.ok(res, { _id: user._id }, 'User deleted');
}));

/* ── AUDIT LOGS (Super Admin) ────────────────────────────────────── */
router.get('/audit/logs', requirePermission('audit:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: ['description', 'action', 'actorName', 'targetId'], filterFields: ['module', 'action', 'severity', 'actor', 'actorRole'], defaultSort: '-at' });
  const { items, meta } = await paginate(AuditLog, opts || {}, {});
  return respond.list(res, items, meta);
}));

module.exports = router;
