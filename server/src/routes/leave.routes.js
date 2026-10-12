'use strict';
const express = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const { LeaveRequest, LeaveType, LeaveBalance, Employee, Holiday, CompanySettings, Attendance } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const validate = require('../middleware/validate');
const { requirePermission, scopeFilter, assertCanActOnEmployee, directReportIds } = require('../middleware/auth');
const { buildQuery, paginate } = require('../utils/query');
const { recordAudit } = require('../utils/audit');
const { sendCSV } = require('../utils/csv');
const { notify } = require('../utils/notify');
const T = require('../utils/time');

const router = express.Router();
const POPULATE = [
  { path: 'employee', select: 'firstName lastName employeeId profilePhoto department designation reportingManager' },
  { path: 'leaveType', select: 'name code color paid' },
  { path: 'approvals.approver', select: 'name role' },
  { path: 'handoverTo', select: 'firstName lastName employeeId' },
];

async function getSettings() { return (await CompanySettings.findOne({ singleton: 'company' })) || {}; }
async function ensureSelf(req) {
  if (req.scope.selfEmployeeId) return req.scope.selfEmployeeId;
  const emp = await Employee.findOne({ user: req.user._id, deletedAt: null }).select('_id');
  if (!emp) throw ApiError.forbidden('Your login is not linked to an employee record.');
  req.scope.selfEmployeeId = emp._id;
  return emp._id;
}

/** Working-day breakdown between two dates (excludes weekly offs + holidays). */
async function buildBreakdown(employee, startDate, endDate, isHalfDay, settings) {
  const workingDays = settings?.workingDays || [1, 2, 3, 4, 5];
  const holidays = await Holiday.find({ date: { $gte: startDate, $lte: endDate }, isActive: true, $or: [{ departments: { $size: 0 } }, { departments: employee.department }] }).lean();
  const holidaySet = new Set(holidays.map((h) => +new Date(h.date)));
  const days = [];
  let total = 0;
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const isHoliday = holidaySet.has(+cursor);
    const isWeeklyOff = !workingDays.includes(cursor.getUTCDay());
    let dayValue = 0;
    if (!isHoliday && !isWeeklyOff) dayValue = 1;
    if (isHalfDay && dayValue === 1 && +cursor === +startDate) dayValue = 0.5;
    total += dayValue;
    days.push({ date: new Date(cursor), dayValue, isHoliday, isWeeklyOff });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { days, total: Math.round(total * 100) / 100, holidays };
}

async function getOrCreateBalance(employeeId, leaveType, year) {
  let balance = await LeaveBalance.findOne({ employee: employeeId, leaveType: leaveType._id, year });
  if (!balance) balance = await LeaveBalance.create({ employee: employeeId, leaveType: leaveType._id, year, allocated: leaveType.annualQuota || 0 });
  return balance;
}

/* ── APPLY ────────────────────────────────────────────────────────── */
router.post('/requests', requirePermission('leave:create'), validate({ body: z.object({
  leaveType: z.string().min(1, 'Leave type is required'),
  startDate: z.coerce.date(), endDate: z.coerce.date(),
  isHalfDay: z.boolean().optional(), halfDaySession: z.enum(['first_half', 'second_half']).optional(),
  reason: z.string().min(5, 'Please provide a reason (min 5 characters)'),
  contactDuringLeave: z.string().optional(), handoverTo: z.string().optional().nullable(),
  attachments: z.array(z.object({ fileName: z.string().optional(), url: z.string(), fileType: z.string().optional(), size: z.number().optional() })).optional(),
}) }), asyncHandler(async (req, res) => {
  const empId = await ensureSelf(req);
  const settings = await getSettings();
  const tz = settings.timezone || 'Asia/Kolkata';
  const employee = await Employee.findById(empId);
  const leaveType = await LeaveType.findOne({ _id: req.body.leaveType, isActive: true });
  if (!leaveType) throw ApiError.badRequest('Selected leave type is not available');
  if (leaveType.genderRestriction !== 'none' && employee.gender !== leaveType.genderRestriction) throw ApiError.badRequest(`${leaveType.name} is not applicable to you`);

  const start = T.dateKey(req.body.startDate, tz);
  const end = T.dateKey(req.body.endDate, tz);
  if (end < start) throw ApiError.badRequest('End date cannot be before the start date');
  const policy = settings?.leavePolicy || {};
  const maxConsecutive = Math.min(leaveType.maxConsecutiveDays || 30, policy.maxConsecutiveDays || 30);
  if (T.minutesBetween(start, end) / 1440 + 1 > maxConsecutive) throw ApiError.badRequest(`A single request cannot exceed ${maxConsecutive} consecutive days`);
  const minNotice = leaveType.minNoticeDays ?? policy.minNoticeDays ?? 0;
  if (minNotice && T.minutesBetween(T.dateKey(new Date(), tz), start) / 1440 < minNotice) throw ApiError.badRequest(`${leaveType.name} requires at least ${minNotice} day(s) advance notice`);
  if (leaveType.isHalfDay === false && req.body.isHalfDay) throw ApiError.badRequest(`${leaveType.name} cannot be taken as a half day`);
  if (req.body.isHalfDay && +start !== +end) throw ApiError.badRequest('Half-day leave must start and end on the same date');

  // Overlap prevention (any active request)
  const overlap = await LeaveRequest.findOne({
    employee: empId, status: { $in: ['pending', 'manager_approved', 'hr_approved', 'approved'] },
    startDate: { $lte: end }, endDate: { $gte: start },
  });
  if (overlap) throw ApiError.conflict(`You already have a ${overlap.status} leave request overlapping these dates (${new Date(overlap.startDate).toISOString().slice(0, 10)} → ${new Date(overlap.endDate).toISOString().slice(0, 10)})`);

  const { days, total, holidays } = await buildBreakdown(employee, start, end, !!req.body.isHalfDay, settings);
  if (total <= 0) throw ApiError.badRequest('Selected dates contain only holidays/weekly offs — no leave required');

  const year = new Date(start).getUTCFullYear();
  const balance = await getOrCreateBalance(empId, leaveType, year);
  const available = balance.allocated + balance.carriedForward + balance.adjusted - balance.used - balance.pending - balance.encashed - balance.lapsed;
  if (leaveType.paid && available < total) throw ApiError.badRequest(`Insufficient ${leaveType.name} balance. Available: ${available} day(s), requested: ${total} day(s)`);
  if (leaveType.maxPerMonth) {
    const { start: mStart, end: mEnd } = T.monthRange(year, new Date(start).getUTCMonth() + 1);
    const usedThisMonth = await LeaveRequest.aggregate([
      { $match: { employee: new mongoose.Types.ObjectId(empId), leaveType: leaveType._id, startDate: { $gte: mStart, $lte: mEnd }, status: { $in: ['pending', 'manager_approved', 'hr_approved', 'approved'] } } },
      { $group: { _id: null, days: { $sum: '$totalDays' } } },
    ]);
    if ((usedThisMonth[0]?.days || 0) + total > leaveType.maxPerMonth) throw ApiError.badRequest(`Maximum ${leaveType.maxPerMonth} ${leaveType.name} day(s) allowed per month`);
  }
  const needsDocument = leaveType.requiresDocument || (leaveType.requiresDocumentAfterDays && total > leaveType.requiresDocumentAfterDays);
  if (needsDocument && !(req.body.attachments || []).length) throw ApiError.badRequest(`${leaveType.name} requires a supporting document (e.g. medical certificate)`);

  const approvalChain = [];
  const levels = Math.min(3, Math.max(1, leaveType.approvalLevels || 2));
  if (employee.reportingManager && levels >= 1) approvalChain.push({ level: 1, role: 'manager', approver: null });
  approvalChain.push({ level: approvalChain.length + 1, role: 'hr', approver: null });
  if (levels >= 3) approvalChain.push({ level: 3, role: 'admin', approver: null });

  const request = await LeaveRequest.create({
    employee: empId, leaveType: leaveType._id, startDate: start, endDate: end,
    isHalfDay: !!req.body.isHalfDay, halfDaySession: req.body.halfDaySession || null,
    totalDays: total, reason: req.body.reason, contactDuringLeave: req.body.contactDuringLeave,
    handoverTo: req.body.handoverTo || null, attachments: req.body.attachments || [],
    status: 'pending', currentLevel: 1, approvals: approvalChain, year, daysBreakdown: days,
    auditTrail: [{ by: req.user._id, action: 'applied', note: `Applied for ${total} day(s)` }],
  });

  // Hold the days as pending so the balance can't be double-spent
  balance.pending += total;
  await balance.save();

  // Notify the first approver (manager, else HR)
  let approverUserId = null;
  if (employee.reportingManager) {
    const mgr = await Employee.findById(employee.reportingManager).select('user').lean();
    approverUserId = mgr?.user;
  } else {
    const { User } = require('../models');
    const hr = await User.findOne({ role: 'hr_admin', isActive: true }).select('_id').lean();
    approverUserId = hr?._id;
  }
  await notify({ userId: approverUserId, title: 'Leave request awaiting your approval', body: `${employee.fullName} applied for ${total} day(s) ${leaveType.name} (${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}).`, type: 'leave', link: `/leave/requests/${request._id}`, sendEmail: true });
  await recordAudit(req, { action: 'leave.apply', module: 'leave', targetModel: 'LeaveRequest', targetId: request._id, description: `${employee.fullName} applied for ${total} day(s) of ${leaveType.name}` });
  const populated = await LeaveRequest.findById(request._id).populate(POPULATE);
  return respond.created(res, { request: populated, balance: { ...balance.toObject(), available: available - total }, holidaysConsidered: holidays.length }, 'Leave request submitted');
}));

/* ── LIST (scope aware) ───────────────────────────────────────────── */
router.get('/requests', requirePermission('leave:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: ['reason'], filterFields: ['status', 'leaveType', 'employee', 'year'], defaultSort: '-appliedAt' });
  delete opts.filter.employee;
  Object.assign(opts.filter, await scopeFilter(req, 'employee'));
  if (req.query.employee && req.scope.isGlobal) opts.filter.employee = req.query.employee;
  if (req.query.mine === 'true') opts.filter.employee = req.scope.selfEmployeeId;

  const { items, meta } = await paginate(LeaveRequest, opts, { populate: POPULATE });
  const clean = items.map((r) => ({ ...r, canAct: r.approvals?.some((a) => a.status === 'pending' && a.level === r.currentLevel) }));
  if (req.query.export === 'csv') {
    return sendCSV(res, `leave-requests-${Date.now()}.csv`, clean, [
      { key: 'employee.employeeId', label: 'Employee ID' }, { key: 'employee.firstName', label: 'First Name' },
      { key: 'employee.lastName', label: 'Last Name' }, { key: 'leaveType.name', label: 'Leave Type' },
      { key: 'startDate', label: 'From', value: (r) => new Date(r.startDate).toISOString().slice(0, 10) },
      { key: 'endDate', label: 'To', value: (r) => new Date(r.endDate).toISOString().slice(0, 10) },
      { key: 'totalDays', label: 'Days' }, { key: 'status', label: 'Status' }, { key: 'reason', label: 'Reason' },
    ]);
  }
  return respond.list(res, clean, meta);
}));

/* ── PENDING FOR ME (approvals inbox) ─────────────────────────────── */
router.get('/requests/pending-approvals', requirePermission('leave:view'), asyncHandler(async (req, res) => {
  let items;
  if (req.scope.isGlobal) {
    items = await LeaveRequest.find({ status: 'pending' }).populate(POPULATE).sort('startDate').lean();
  } else {
    const teamIds = [req.scope.selfEmployeeId, ...(await directReportIds(req.scope.selfEmployeeId))].filter(Boolean);
    items = await LeaveRequest.find({ employee: { $in: teamIds }, status: { $in: ['pending', 'manager_approved'] }, 'approvals.status': 'pending' }).populate(POPULATE).sort('startDate').lean();
    items = items.filter((r) => {
      const step = (r.approvals || []).find((a) => a.level === r.currentLevel && a.status === 'pending');
      if (!step) return false;
      if (step.role === 'manager') return true;
      return req.user.role === 'hr_admin' || req.user.role === 'hr_manager' || req.user.role === 'super_admin';
    });
  }
  return respond.list(res, items, { total: items.length });
}));

router.get('/requests/:id', requirePermission('leave:view'), asyncHandler(async (req, res) => {
  const request = await LeaveRequest.findById(req.params.id).populate(POPULATE).lean();
  if (!request) throw ApiError.notFound('Leave request not found');
  const isSelf = String(request.employee?._id) === String(req.scope.selfEmployeeId);
  if (!req.scope.isGlobal && !isSelf) await assertCanActOnEmployee(req, request.employee._id);
  return respond.ok(res, request);
}));

/* ── APPROVE / REJECT (multi-level) ───────────────────────────────── */
async function decide(req, res, decision) {
  const request = await LeaveRequest.findById(req.params.id).populate('employee').populate('leaveType');
  if (!request) throw ApiError.notFound('Leave request not found');
  if (['approved', 'rejected', 'cancelled'].includes(request.status) && !(request.status === 'rejected')) throw ApiError.badRequest(`This request is already ${request.status}`);
  const step = request.approvals.find((a) => a.level === request.currentLevel && a.status === 'pending');
  if (!step) throw ApiError.badRequest('No pending approval step found for this request');

  const isManagerStep = step.role === 'manager';
  const isHrStep = step.role === 'hr' || step.role === 'admin';
  const perms = req.user.__perms || [];
  const canApproveHr = req.scope.isGlobal || perms.includes('*') || ['super_admin', 'hr_admin', 'hr_manager'].includes(req.user.role);
  if (isManagerStep && !(req.scope.isGlobal || perms.includes('leave:approve') || req.user.role === 'team_leader' || req.user.role === 'department_manager')) {
    throw ApiError.forbidden('You are not authorised to approve this request');
  }
  if (isHrStep && !canApproveHr) throw ApiError.forbidden('HR approval required — you are not authorised for this step');
  if (isManagerStep && !req.scope.isGlobal) {
    const teamIds = [req.scope.selfEmployeeId, ...(await directReportIds(req.scope.selfEmployeeId))].map(String);
    if (!teamIds.includes(String(request.employee._id))) throw ApiError.forbidden('This employee is not in your team');
  }
  if (String(request.employee._id) === String(req.scope.selfEmployeeId)) throw ApiError.forbidden('You cannot approve your own leave request');

  step.status = decision;
  step.approver = req.user._id;
  step.decidedAt = new Date();
  step.comment = req.body.comment;

  const year = request.year || new Date(request.startDate).getUTCFullYear();
  const balance = await LeaveBalance.findOne({ employee: request.employee._id, leaveType: request.leaveType._id, year });
  const settings = await getSettings();

  if (decision === 'rejected') {
    request.status = 'rejected';
    request.rejectionReason = req.body.comment || 'Rejected';
    request.decidedAt = new Date();
    if (balance) { balance.pending = Math.max(0, balance.pending - request.totalDays); await balance.save(); }
  } else {
    const remaining = request.approvals.filter((a) => a.status === 'pending');
    if (remaining.length) {
      request.currentLevel = Math.min(...remaining.map((a) => a.level));
      request.status = 'manager_approved';
      request.approvals.forEach((a) => { if (a.status === 'pending' && a.level < request.currentLevel) a.status = 'skipped'; });
      const { User } = require('../models');
      const nextRole = remaining.find((a) => a.level === request.currentLevel)?.role;
      const nextApprover = nextRole === 'manager'
        ? (await Employee.findById(request.employee.reportingManager).select('user').lean())?.user
        : (await User.findOne({ role: 'hr_admin', isActive: true }).select('_id').lean())?._id;
      await notify({ userId: nextApprover, title: 'Leave request pending HR approval', body: `${request.employee.fullName}'s ${request.leaveType.name} request (${request.totalDays} day(s)) needs your approval.`, type: 'leave', link: `/leave/requests/${request._id}`, sendEmail: true });
    } else {
      request.status = 'approved';
      request.decidedAt = new Date();
      if (balance) {
        balance.pending = Math.max(0, balance.pending - request.totalDays);
        balance.used += request.totalDays;
        await balance.save();
      }
    }
  }
  request.auditTrail.push({ by: req.user._id, action: `level${step.level}_${decision}`, note: req.body.comment });

  // On final approval, block the calendar days as "on_leave" so attendance is consistent
  if (request.status === 'approved') {
    for (const day of request.daysBreakdown.filter((d) => d.dayValue > 0)) {
      await Attendance.findOneAndUpdate(
        { employee: request.employee._id, date: T.dateKey(day.date, settings.timezone || 'Asia/Kolkata') },
        { $set: { status: 'on_leave', remarks: `Approved ${request.leaveType.name}` }, $setOnInsert: { employee: request.employee._id, date: T.dateKey(day.date, settings.timezone || 'Asia/Kolkata') } },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }
  }
  await request.save();
  await notify({
    userId: request.employee.user, title: `Leave request ${request.status === 'manager_approved' ? 'approved by manager — awaiting HR' : request.status}`,
    body: `Your ${request.leaveType.name} request (${new Date(request.startDate).toISOString().slice(0, 10)} → ${new Date(request.endDate).toISOString().slice(0, 10)}, ${request.totalDays} day(s)) is ${request.status.replace('_', ' ')}.${req.body.comment ? ` Comment: ${req.body.comment}` : ''}`,
    type: 'leave', link: `/leave/requests/${request._id}`, sendEmail: true,
  });
  await recordAudit(req, { action: `leave.${decision}`, module: 'leave', targetModel: 'LeaveRequest', targetId: request._id, description: `${decision} leave request of ${request.employee.fullName} (level ${step.level})`, severity: 'warning' });
  return respond.ok(res, await LeaveRequest.findById(request._id).populate(POPULATE), `Leave request ${decision}`);
}

router.post('/requests/:id/approve', requirePermission('leave:approve', 'leave:update'), validate({ body: z.object({ comment: z.string().optional() }) }), asyncHandler((req, res) => decide(req, res, 'approved')));
router.post('/requests/:id/reject', requirePermission('leave:approve', 'leave:update'), validate({ body: z.object({ comment: z.string().min(3, 'Please provide a rejection reason') }) }), asyncHandler((req, res) => decide(req, res, 'rejected')));

/* ── CANCEL (employee) ────────────────────────────────────────────── */
router.post('/requests/:id/cancel', requirePermission('leave:create', 'leave:update'), validate({ body: z.object({ reason: z.string().optional() }) }), asyncHandler(async (req, res) => {
  const request = await LeaveRequest.findById(req.params.id);
  if (!request) throw ApiError.notFound('Leave request not found');
  const isSelf = String(request.employee) === String(req.scope.selfEmployeeId);
  if (!isSelf && !req.scope.isGlobal) throw ApiError.forbidden('You can only cancel your own leave requests');
  if (['rejected', 'cancelled'].includes(request.status)) throw ApiError.badRequest(`Request is already ${request.status}`);
  if (new Date(request.startDate) < new Date(new Date().toDateString()) && !req.scope.isGlobal) throw ApiError.badRequest('Leave already started — contact HR to cancel');

  const wasApproved = ['approved', 'hr_approved', 'manager_approved'].includes(request.status);
  const year = request.year || new Date(request.startDate).getUTCFullYear();
  const balance = await LeaveBalance.findOne({ employee: request.employee, leaveType: request.leaveType, year });
  if (balance) {
    if (request.status === 'approved') balance.used = Math.max(0, balance.used - request.totalDays);
    else balance.pending = Math.max(0, balance.pending - request.totalDays);
    await balance.save();
  }
  request.status = 'cancelled';
  request.cancelledAt = new Date();
  request.cancelReason = req.body.reason;
  request.auditTrail.push({ by: req.user._id, action: 'cancelled', note: req.body.reason });
  await request.save();
  if (wasApproved) {
    await Attendance.updateMany(
      { employee: request.employee, date: { $gte: request.startDate, $lte: request.endDate }, status: 'on_leave', remarks: /Approved/ },
      { $set: { status: 'present', remarks: 'Leave cancelled' } }
    );
  }
  await recordAudit(req, { action: 'leave.cancel', module: 'leave', targetId: request._id, description: `Leave request cancelled`, severity: 'warning' });
  return respond.ok(res, request, 'Leave request cancelled');
}));

/* ── BALANCES ─────────────────────────────────────────────────────── */
router.get('/balances/me', requirePermission('leave:view'), asyncHandler(async (req, res) => {
  const empId = await ensureSelf(req);
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const types = await LeaveType.find({ isActive: true }).lean();
  for (const t of types) await getOrCreateBalance(empId, t, year);
  const balances = await LeaveBalance.find({ employee: empId, year }).populate('leaveType', 'name code color paid allowHalfDay').lean({ virtuals: true });
  const taken = await LeaveRequest.aggregate([
    { $match: { employee: new mongoose.Types.ObjectId(empId), year, status: 'approved' } },
    { $group: { _id: '$leaveType', days: { $sum: '$totalDays' } } },
  ]);
  return respond.ok(res, { year, balances: balances.map((b) => ({ ...b, takenThisYear: taken.find((t) => String(t._id) === String(b.leaveType?._id))?.days || 0 })) });
}));

router.get('/balances', requirePermission('leave:update', 'reports:view'), asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const opts = buildQuery(req.query, { searchFields: [], filterFields: ['leaveType'], defaultSort: 'employee' });
  const filter = { year, ...(req.query.employee ? { employee: req.query.employee } : {}) };
  const items = await LeaveBalance.find(filter).populate('employee', 'firstName lastName employeeId department').populate('leaveType', 'name code color').lean({ virtuals: true });
  if (req.query.department) {
    const ids = await Employee.distinct('_id', { department: req.query.department });
    return respond.list(res, items.filter((b) => ids.map(String).includes(String(b.employee?._id))), { total: items.length });
  }
  void opts;
  return respond.list(res, items, { total: items.length });
}));

router.post('/balances/adjust', requirePermission('leave:update'), validate({ body: z.object({
  employeeId: z.string(), leaveType: z.string(), year: z.coerce.number().optional(),
  allocated: z.coerce.number().optional(), adjust: z.coerce.number().optional(), carriedForward: z.coerce.number().optional(), note: z.string().optional(),
}) }), asyncHandler(async (req, res) => {
  const year = req.body.year || new Date().getFullYear();
  const leaveType = await LeaveType.findById(req.body.leaveType);
  if (!leaveType) throw ApiError.notFound('Leave type not found');
  const balance = await getOrCreateBalance(req.body.employeeId, leaveType, year);
  if (req.body.allocated !== undefined) balance.allocated = req.body.allocated;
  if (req.body.carriedForward !== undefined) balance.carriedForward = req.body.carriedForward;
  if (req.body.adjust !== undefined) balance.adjusted += req.body.adjust;
  await balance.save();
  await recordAudit(req, { action: 'leave.balance_adjust', module: 'leave', targetId: balance._id, description: `Adjusted ${leaveType.name} balance for employee ${req.body.employeeId}${req.body.note ? `: ${req.body.note}` : ''}`, severity: 'critical' });
  return respond.ok(res, await LeaveBalance.findById(balance._id).populate('leaveType', 'name'), 'Leave balance updated');
}));

/* ── ALLOCATION / YEAR-END JOBS ──────────────────────────────────── */
router.post('/jobs/allocate', requirePermission('leave:update'), validate({ body: z.object({ year: z.coerce.number().optional(), employeeIds: z.array(z.string()).optional(), carryForward: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const year = req.body.year || new Date().getFullYear();
    const prevYear = year - 1;
    const settings = await getSettings();
    const policy = settings?.leavePolicy || {};
    const employees = await Employee.find({ deletedAt: null, isActive: true, ...(req.body.employeeIds?.length ? { _id: { $in: req.body.employeeIds } } : {}) }).select('_id').lean();
    const types = await LeaveType.find({ isActive: true, paid: true }).lean();
    let created = 0, carried = 0;
    for (const emp of employees) {
      for (const t of types) {
        const existing = await LeaveBalance.findOne({ employee: emp._id, leaveType: t._id, year });
        const prev = await LeaveBalance.findOne({ employee: emp._id, leaveType: t._id, year: prevYear });
        let carryForward = 0;
        if (policy.carryForwardEnabled && t.carryForward && prev) {
          const prevAvail = prev.allocated + prev.carriedForward + prev.adjusted - prev.used - prev.encashed - prev.lapsed;
          carryForward = Math.min(Math.max(0, prevAvail), t.maxCarryForward || policy.maxCarryForwardDays || 0);
        }
        if (!existing) {
          await LeaveBalance.create({ employee: emp._id, leaveType: t._id, year, allocated: t.annualQuota, carriedForward: Math.round(carryForward * 100) / 100 });
          created++; if (carryForward) carried++;
        }
      }
    }
    await recordAudit(req, { action: 'leave.allocate', module: 'leave', description: `Allocated ${year} leave balances for ${employees.length} employee(s) (${created} balance records, ${carried} with carry-forward)`, severity: 'warning' });
    return respond.ok(res, { year, employees: employees.length, created, carriedForward: carried }, 'Leave allocation completed');
  })
);

/* ── TEAM CALENDAR ───────────────────────────────────────────────── */
router.get('/calendar', requirePermission('leave:view'), asyncHandler(async (req, res) => {
  const now = new Date();
  const year = parseInt(req.query.year, 10) || now.getFullYear();
  const month = parseInt(req.query.month, 10) || now.getMonth() + 1;
  const { start, end } = T.monthRange(year, month);
  const filter = { status: { $in: ['approved', 'hr_approved', 'manager_approved'] }, startDate: { $lte: end }, endDate: { $gte: start } };
  if (req.query.department) {
    const ids = await Employee.distinct('_id', { department: req.query.department, deletedAt: null });
    filter.employee = { $in: ids };
  } else if (!req.scope.isGlobal) {
    const ids = [req.scope.selfEmployeeId, ...(await directReportIds(req.scope.selfEmployeeId))].filter(Boolean);
    filter.employee = { $in: ids };
  }
  const [requests, holidays] = await Promise.all([
    LeaveRequest.find(filter).populate('employee', 'firstName lastName employeeId profilePhoto department').populate('leaveType', 'name code color').lean(),
    Holiday.find({ year, isActive: true, date: { $gte: start, $lte: end } }).lean(),
  ]);
  const byDay = {};
  T.listDays(start, end).forEach((d) => { byDay[d.toISOString().slice(0, 10)] = { date: d, leaves: [], holiday: null }; });
  requests.forEach((r) => {
    T.listDays(new Date(r.startDate), new Date(r.endDate)).forEach((d) => {
      const key = d.toISOString().slice(0, 10);
      if (byDay[key] && d >= start && d <= end) byDay[key].leaves.push({ id: r._id, employee: r.employee, leaveType: r.leaveType, isHalfDay: r.isHalfDay, status: r.status });
    });
  });
  holidays.forEach((h) => { const key = new Date(h.date).toISOString().slice(0, 10); if (byDay[key]) byDay[key].holiday = { name: h.name, type: h.type }; });
  return respond.ok(res, { year, month, monthName: T.MONTHS[month - 1], days: Object.values(byDay) });
}));

/* ── REPORTS ─────────────────────────────────────────────────────── */
router.get('/reports/summary', requirePermission('leave:view', 'reports:view'), asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const filter = { year };
  if (req.query.department) {
    const ids = await Employee.distinct('_id', { department: req.query.department, deletedAt: null });
    filter.employee = { $in: ids };
  }
  const [byStatus, byType, byMonth, topUsers] = await Promise.all([
    LeaveRequest.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 }, days: { $sum: '$totalDays' } } }]),
    LeaveRequest.aggregate([{ $match: { ...filter, status: 'approved' } }, { $group: { _id: '$leaveType', days: { $sum: '$totalDays' }, count: { $sum: 1 } } }, { $lookup: { from: 'leavetypes', localField: '_id', foreignField: '_id', as: 't' } }, { $unwind: '$t' }, { $project: { name: '$t.name', color: '$t.color', days: 1, count: 1, _id: 0 } }]),
    LeaveRequest.aggregate([{ $match: { ...filter, status: 'approved' } }, { $group: { _id: { m: { $month: '$startDate' } }, days: { $sum: '$totalDays' } } }, { $sort: { '_id.m': 1 } }]),
    LeaveRequest.aggregate([
      { $match: { ...filter, status: 'approved' } },
      { $group: { _id: '$employee', days: { $sum: '$totalDays' }, requests: { $sum: 1 } } },
      { $sort: { days: -1 } }, { $limit: 10 },
      { $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'e' } }, { $unwind: '$e' },
      { $project: { name: { $concat: ['$e.firstName', ' ', '$e.lastName'] }, employeeId: '$e.employeeId', days: 1, requests: 1, _id: 0 } },
    ]),
  ]);
  return respond.ok(res, {
    year, byStatus, byType, monthlyTrend: byMonth.map((m) => ({ month: T.MONTHS[m._id.m - 1], days: m.days })), topUsers,
  });
}));

module.exports = router;
