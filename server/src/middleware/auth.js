'use strict';
const User = require('../models/User');
const Employee = require('../models/Employee');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyAccessToken } = require('../utils/jwt');
const { ROLES } = require('../config/constants');
const { resolvePermissions, can } = require('../utils/permissions');

/** Effective permission set: DB role permissions (editable) + per-user overrides. */
const effectivePermissions = (user) => resolvePermissions(user);

const hasPermission = (user, permission) => can(user.__perms || [], permission);

/** Verifies the Bearer / cookie access token and attaches req.user + req.scope. */
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.accessToken;
  if (!token) throw ApiError.unauthorized('Authentication required. Please sign in.');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (e) {
    throw ApiError.unauthorized(e.name === 'TokenExpiredError' ? 'Session expired. Please sign in again.' : 'Invalid session token.');
  }

  const user = await User.findById(payload.sub).populate('employee', 'firstName lastName employeeId department designation status profilePhoto');
  if (!user) throw ApiError.unauthorized('Account no longer exists.');
  if (!user.isActive) throw ApiError.forbidden('Your account has been deactivated. Contact an administrator.');
  // JWT `iat` સેકન્ડ-સ્તરે હોય છે, passwordChangedAt મિલિસેકન્ડમાં — બંનેને સેકન્ડમાં સરખાવો,
  // નહીંતર પાસવર્ડ બદલાયાની એ જ સેકન્ડમાં લીધેલું તાજું token પણ "જૂનું" ગણાઈ જાય.
  if (user.passwordChangedAt) {
    const changedAtSec = Math.floor(user.passwordChangedAt.getTime() / 1000);
    if (payload.iat < changedAtSec) throw ApiError.unauthorized('Password was changed. Please sign in again.');
  }

  req.user = user;
  req.user.__perms = await resolvePermissions(user);
  req.permissions = req.user.__perms;

  // Data scope: who is this user allowed to see/edit records for?
  const emp = user.employee;
  const globalView = ['super_admin', 'hr_admin', 'hr_manager'].includes(user.role);
  req.scope = {
    isGlobal: globalView,
    selfEmployeeId: emp?._id || null,
    departmentId: emp?.department?._id || emp?.department || null,
    isManager: ['super_admin', 'hr_admin', 'hr_manager', 'department_manager', 'team_leader'].includes(user.role),
  };
  next();
});

/** Role gate. */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.length || roles.includes(req.user.role)) return next();
  return next(ApiError.forbidden(`This action requires one of: ${roles.join(', ')}`));
};

/** Permission gate — enforced on the server for every protected operation. */
const requirePermission = (...permissions) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  const ok = permissions.some((p) => hasPermission(req.user, p));
  if (!ok) return next(ApiError.forbidden(`Missing permission: ${permissions.join(' or ')}`));
  next();
};

/** Loads the caller's own employee record (self-service endpoints). */
const loadSelfEmployee = asyncHandler(async (req, res, next) => {
  if (!req.user.employee) throw ApiError.forbidden('No employee profile is linked to this account.');
  const emp = await Employee.findById(req.user.employee._id || req.user.employee);
  if (!emp) throw ApiError.notFound('Employee profile not found.');
  req.selfEmployee = emp;
  next();
});

/**
 * Restricts a query filter to the caller's scope. Employees see only their own
 * records; team leaders/managers see their team; HR/admin see everything.
 */
async function scopeFilter(req, field = 'employee', { ownOnly = false } = {}) {
  if (req.scope.isGlobal) return {};
  if (ownOnly || !req.scope.isManager || req.user.role === ROLES.EMPLOYEE) {
    if (!req.scope.selfEmployeeId) throw ApiError.forbidden('Your account is not linked to an employee record.');
    return { [field]: req.scope.selfEmployeeId };
  }
  // Managers/leaders: people who report to them (directly) plus themselves.
  const reports = await directReportIds(req.scope.selfEmployeeId);
  const ids = [req.scope.selfEmployeeId, ...reports].filter(Boolean);
  return { [field]: { $in: ids } };
}

async function directReportIds(managerId, depth = 0) {
  if (!managerId || depth > 4) return [];
  const kids = await Employee.find({ reportingManager: managerId, deletedAt: null }).select('_id').lean();
  const ids = kids.map((k) => k._id);
  if (depth >= 3 || !ids.length) return ids;
  const grand = await directReportIdsMany(ids, depth + 1);
  return [...ids, ...grand];
}
async function directReportIdsMany(ids, depth) {
  const out = [];
  for (const id of ids) out.push(...(await directReportIds(id, depth)));
  return out;
}

/** Throws unless the caller may act on the given employee id. */
async function assertCanActOnEmployee(req, employeeId) {
  if (req.scope.isGlobal) return true;
  const selfId = String(req.scope.selfEmployeeId || '');
  if (selfId === String(employeeId)) return true;
  if (req.scope.isManager) {
    const reports = await directReportIds(req.scope.selfEmployeeId);
    if (reports.some((r) => String(r) === String(employeeId))) return true;
  }
  throw ApiError.forbidden('You can only act on records within your scope.');
}

module.exports = {
  authenticate, authorize, requirePermission, hasPermission, effectivePermissions,
  loadSelfEmployee, scopeFilter, assertCanActOnEmployee, directReportIds,
};
