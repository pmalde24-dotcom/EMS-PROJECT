'use strict';
const express = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const { Attendance, Employee, Shift, Holiday, CompanySettings, LeaveRequest } = require('../models');
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
  { path: 'employee', select: 'firstName lastName employeeId profilePhoto department designation' },
  { path: 'shift', select: 'name startTime endTime graceMinutes' },
];
const todayKey = (settings) => T.dateKey(new Date(), settings?.timezone || 'Asia/Kolkata');

async function getSettings() { return (await CompanySettings.findOne({ singleton: 'company' })) || {}; }

async function ensureSelf(req) {
  if (req.scope.selfEmployeeId) return req.scope.selfEmployeeId;
  const emp = await Employee.findOne({ user: req.user._id, deletedAt: null }).select('_id');
  if (!emp) throw ApiError.forbidden('Your login is not linked to an employee record.');
  req.scope.selfEmployeeId = emp._id;
  return emp._id;
}

/** Computes worked minutes, late/early/OT flags for a record against its shift + policy. */
function computeMetrics(record, shift, settings) {
  const policy = settings?.attendancePolicy || {};
  const tz = settings?.timezone || 'Asia/Kolkata';
  const day = record.date;
  const shiftStart = shift?.startTime || settings?.workingHours?.start || '09:30';
  const shiftEnd = shift?.endTime || settings?.workingHours?.end || '18:30';
  const grace = shift?.graceMinutes ?? policy.gracePeriodMinutes ?? 15;
  const breakMinutes = record.breakMinutes || shift?.breakMinutes || 0;

  if (record.checkIn) {
    const expectIn = T.instantFor(day, shiftStart, tz);
    const lateBy = T.minutesBetween(expectIn, record.checkIn);
    record.lateMinutes = lateBy > grace ? lateBy : 0;
    record.isLate = record.lateMinutes > 0;
  } else { record.lateMinutes = 0; record.isLate = false; }

  if (record.checkIn && record.checkOut) {
    record.workedMinutes = Math.max(0, T.minutesBetween(record.checkIn, record.checkOut) - breakMinutes);
    const expectOut = T.instantFor(day, shiftEnd, tz);
    const earlyBy = T.minutesBetween(record.checkOut, expectOut);
    record.earlyExitMinutes = earlyBy > grace ? earlyBy : 0;
    record.isEarlyExit = record.earlyExitMinutes > 0;
    const otAfter = (policy.overtimeAfterHours || 9) * 60;
    record.overtimeMinutes = Math.max(0, Math.min(record.workedMinutes - otAfter, (policy.maxOvertimeHoursPerDay || 4) * 60));
    record.isOvertime = record.overtimeMinutes > 0;
    const halfDay = (policy.halfDayThresholdHours || 4) * 60;
    const full = (policy.fullDayHours || 8) * 60;
    if (['present', 'late', 'early_exit', 'work_from_home'].includes(record.status)) {
      if (record.workedMinutes < halfDay) record.status = 'half_day';
      else if (record.workedMinutes < full && record.status === 'present') record.status = record.isLate ? 'late' : 'present';
    }
  }
  return record;
}

/* ── PUNCH IN ─────────────────────────────────────────────────────── */
router.post('/punch-in', requirePermission('attendance:create'), validate({ body: z.object({
  workFromHome: z.boolean().optional(), lat: z.number().optional(), lng: z.number().optional(), address: z.string().optional(), remarks: z.string().optional(),
}) }), asyncHandler(async (req, res) => {
  const empId = await ensureSelf(req);
  const settings = await getSettings();
  const tz = settings.timezone || 'Asia/Kolkata';
  const day = todayKey(settings);

  let record = await Attendance.findOne({ employee: empId, date: day });
  if (record?.checkIn && !settings?.attendancePolicy?.allowMultiplePunches) {
    throw ApiError.conflict(`You already checked in today at ${T.timeString(record.checkIn, tz)}`);
  }
  const employee = await Employee.findById(empId).populate('shift');
  const holiday = await Holiday.findOne({ date: day, isActive: true, $or: [{ region: 'National' }, { departments: employee.department }] });
  if (holiday) throw ApiError.badRequest(`Today is a holiday: ${holiday.name}`);

  const now = new Date();
  if (!record) {
    record = new Attendance({
      employee: empId, date: day, shift: employee.shift?._id, status: req.body.workFromHome ? 'work_from_home' : 'present',
      workFromHome: !!req.body.workFromHome, source: 'web',
      location: { lat: req.body.lat, lng: req.body.lng, address: req.body.address, ip: req.ip },
      punches: [{ at: now, type: 'in', ip: req.ip, source: 'web' }], checkIn: now, remarks: req.body.remarks,
    });
  } else {
    record.checkIn = now;
    record.punches.push({ at: now, type: 'in', ip: req.ip, source: 'web' });
  }
  computeMetrics(record, employee.shift, settings);
  record.auditTrail.push({ by: req.user._id, action: 'punch_in', after: { checkIn: now } });
  await record.save();
  return respond.created(res, record, `Checked in at ${T.timeString(now, tz)}${record.isLate ? ` (late by ${record.lateMinutes} min)` : ''}`);
}));

/* ── PUNCH OUT ────────────────────────────────────────────────────── */
router.post('/punch-out', requirePermission('attendance:create'), validate({ body: z.object({ remarks: z.string().optional(), lat: z.number().optional(), lng: z.number().optional() }) }),
  asyncHandler(async (req, res) => {
    const empId = await ensureSelf(req);
    const settings = await getSettings();
    const tz = settings.timezone || 'Asia/Kolkata';
    const day = todayKey(settings);
    const record = await Attendance.findOne({ employee: empId, date: day });
    if (!record || !record.checkIn) throw ApiError.badRequest('You have not checked in today.');
    if (record.checkOut) throw ApiError.conflict(`You already checked out today at ${T.timeString(record.checkOut, tz)}. Raise a correction request if this is wrong.`);
    const employee = await Employee.findById(empId).populate('shift');
    const now = new Date();
    record.checkOut = now;
    record.punches.push({ at: now, type: 'out', ip: req.ip, source: 'web' });
    if (req.body.remarks) record.remarks = [record.remarks, req.body.remarks].filter(Boolean).join(' | ');
    computeMetrics(record, employee.shift, settings);
    record.auditTrail.push({ by: req.user._id, action: 'punch_out', after: { checkOut: now } });
    await record.save();
    const hrs = Math.floor(record.workedMinutes / 60), mins = record.workedMinutes % 60;
    return respond.ok(res, record, `Checked out at ${T.timeString(now, tz)}. Worked ${hrs}h ${mins}m.`);
  })
);

/* ── BREAKS ───────────────────────────────────────────────────────── */
router.post('/break/:action(start|end)', requirePermission('attendance:create'), asyncHandler(async (req, res) => {
  const empId = await ensureSelf(req);
  const settings = await getSettings();
  const day = todayKey(settings);
  const record = await Attendance.findOne({ employee: empId, date: day });
  if (!record || !record.checkIn) throw ApiError.badRequest('Check in first');
  const now = new Date();
  if (req.params.action === 'start') {
    record.punches.push({ at: now, type: 'break_start', source: 'web' });
    await record.save();
    return respond.ok(res, record, 'Break started');
  }
  const lastStart = [...record.punches].reverse().find((p) => p.type === 'break_start' && !record.punches.some((x) => x.type === 'break_end' && x.at > p.at));
  const added = lastStart ? T.minutesBetween(lastStart.at, now) : 0;
  record.breakMinutes = (record.breakMinutes || 0) + added;
  record.punches.push({ at: now, type: 'break_end', source: 'web' });
  await record.save();
  return respond.ok(res, record, `Break ended (${added} min). Total break: ${record.breakMinutes} min`);
}));

/* ── TODAY (self) ─────────────────────────────────────────────────── */
router.get('/me/today', requirePermission('attendance:view'), asyncHandler(async (req, res) => {
  const empId = await ensureSelf(req);
  const settings = await getSettings();
  const day = todayKey(settings);
  const record = await Attendance.findOne({ employee: empId, date: day }).populate('shift', 'name startTime endTime').lean();
  const holiday = await Holiday.findOne({ date: day, isActive: true }).lean();
  const employee = await Employee.findById(empId).select('shift workLocation').populate('shift').lean();
  return respond.ok(res, {
    date: day, record, holiday,
    shift: employee?.shift || null,
    live: record?.checkIn && !record?.checkOut
      ? { workingMinutes: T.minutesBetween(record.checkIn, new Date()) - (record.breakMinutes || 0) }
      : null,
    isWorkingDay: !holiday && !(settings?.workingDays || [1, 2, 3, 4, 5]).includes(new Date().getDay() === 0 ? 0 : new Date().getDay()),
  });
}));

/* ── MY MONTH VIEW / CALENDAR ─────────────────────────────────────── */
router.get('/me/calendar', requirePermission('attendance:view'), asyncHandler(async (req, res) => {
  const empId = await ensureSelf(req);
  const settings = await getSettings();
  const now = new Date();
  const year = parseInt(req.query.year, 10) || now.getFullYear();
  const month = parseInt(req.query.month, 10) || now.getMonth() + 1;
  const { start, end } = T.monthRange(year, month);
  const [records, holidays, leaves] = await Promise.all([
    Attendance.find({ employee: empId, date: { $gte: start, $lte: end } }).lean(),
    Holiday.find({ year, isActive: true }).lean(),
    LeaveRequest.find({ employee: empId, status: { $in: ['approved', 'hr_approved'] }, startDate: { $lte: end }, endDate: { $gte: start } }).populate('leaveType', 'name code color').lean(),
  ]);
  const days = T.listDays(start, end).map((d) => {
    const rec = records.find((r) => +new Date(r.date) === +d);
    const hol = holidays.find((h) => +new Date(h.date) === +d);
    const leave = leaves.find((l) => d >= new Date(l.startDate) && d <= new Date(l.endDate));
    const dow = d.getUTCDay();
    return {
      date: d, dayOfMonth: d.getUTCDate(), status: rec?.status || (hol ? 'holiday' : leave ? 'on_leave' : (settings?.workingDays || [1, 2, 3, 4, 5]).includes(dow) ? 'absent' : 'weekly_off'),
      checkIn: rec?.checkIn, checkOut: rec?.checkOut, workedMinutes: rec?.workedMinutes || 0, lateMinutes: rec?.lateMinutes || 0,
      overtimeMinutes: rec?.overtimeMinutes || 0, holiday: hol?.name, leaveType: leave?.leaveType?.name,
    };
  });
  const summary = days.reduce((a, d) => { a[d.status] = (a[d.status] || 0) + 1; a.workedMinutes += d.workedMinutes; a.overtimeMinutes += d.overtimeMinutes; return a; }, { workedMinutes: 0, overtimeMinutes: 0 });
  return respond.ok(res, { year, month, monthName: T.MONTHS[month - 1], days, summary });
}));

/* ── LIST (scope-aware) ───────────────────────────────────────────── */
router.get('/', requirePermission('attendance:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: [], filterFields: ['status', 'employee', 'isLate', 'isOvertime', 'workFromHome', 'department'], defaultSort: '-date' });
  if (req.query.department) {
    const empIds = await Employee.distinct('_id', { department: req.query.department, deletedAt: null });
    opts.filter.employee = opts.filter.employee ? opts.filter.employee : { $in: empIds };
  }
  delete opts.filter.department;
  const scoped = await scopeFilter(req, 'employee');
  Object.assign(opts.filter, scoped);
  if (req.query.department) opts.filter.employee = { $in: (await Employee.distinct('_id', { department: req.query.department, deletedAt: null })) };
  const { items, meta } = await paginate(Attendance, opts, { populate: POPULATE });
  if (req.query.export === 'csv') {
    return sendCSV(res, `attendance-${Date.now()}.csv`, items, [
      { key: 'employee.employeeId', label: 'Employee ID' },
      { key: 'employee.firstName', label: 'First Name' },
      { key: 'employee.lastName', label: 'Last Name' },
      { key: 'date', label: 'Date', value: (r) => new Date(r.date).toISOString().slice(0, 10) },
      { key: 'status', label: 'Status' },
      { key: 'checkIn', label: 'Check In', value: (r) => (r.checkIn ? new Date(r.checkIn).toISOString().slice(11, 16) : '') },
      { key: 'checkOut', label: 'Check Out', value: (r) => (r.checkOut ? new Date(r.checkOut).toISOString().slice(11, 16) : '') },
      { key: 'workedMinutes', label: 'Worked (min)' }, { key: 'lateMinutes', label: 'Late (min)' },
      { key: 'overtimeMinutes', label: 'OT (min)' },
    ]);
  }
  return respond.list(res, items, meta);
}));

/* ── MONTHLY SUMMARY (self or employee) ───────────────────────────── */
router.get('/summary/:employeeId?', requirePermission('attendance:view'), asyncHandler(async (req, res) => {
  const employeeId = req.params.employeeId || await ensureSelf(req);
  if (req.params.employeeId && !req.scope.isGlobal) await assertCanActOnEmployee(req, employeeId);
  const now = new Date();
  const year = parseInt(req.query.year, 10) || now.getFullYear();
  const month = parseInt(req.query.month, 10) || now.getMonth() + 1;
  const { start, end } = T.monthRange(year, month);
  const [agg, settings, holidays] = await Promise.all([
    Attendance.aggregate([
      { $match: { employee: new mongoose.Types.ObjectId(employeeId), date: { $gte: start, $lte: end } } },
      { $group: { _id: null, present: { $sum: { $cond: [{ $in: ['$status', ['present', 'work_from_home']] }, 1, 0] } }, late: { $sum: { $cond: ['$isLate', 1, 0] } }, halfDay: { $sum: { $cond: [{ $eq: ['$status', 'half_day'] }, 1, 0] } }, absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } }, onLeave: { $sum: { $cond: [{ $eq: ['$status', 'on_leave'] }, 1, 0] } }, workedMinutes: { $sum: '$workedMinutes' }, overtimeMinutes: { $sum: '$overtimeMinutes' } } },
    ]),
    getSettings(),
    Holiday.countDocuments({ year, isActive: true }),
  ]);
  const workingDays = T.listDays(start, end).filter((d) => (settings?.workingDays || [1, 2, 3, 4, 5]).includes(d.getUTCDay())).length;
  const s = agg[0] || {};
  return respond.ok(res, {
    year, month, employeeId, workingDays, holidays,
    present: s.present || 0, late: s.late || 0, halfDay: s.halfDay || 0, absent: s.absent || 0, onLeave: s.onLeave || 0,
    workedHours: Math.round(((s.workedMinutes || 0) / 60) * 10) / 10,
    overtimeHours: Math.round(((s.overtimeMinutes || 0) / 60) * 10) / 10,
    attendancePercent: workingDays ? Math.round((((s.present || 0) + (s.halfDay || 0) * 0.5) / workingDays) * 1000) / 10 : 0,
  });
}));

/* ── DEPARTMENT REPORT ────────────────────────────────────────────── */
router.get('/reports/department', requirePermission('attendance:view', 'reports:view'), asyncHandler(async (req, res) => {
  const now = new Date();
  const year = parseInt(req.query.year, 10) || now.getFullYear();
  const month = parseInt(req.query.month, 10) || now.getMonth() + 1;
  const { start, end } = T.monthRange(year, month);
  const empFilter = { deletedAt: null, isActive: true };
  if (req.query.department) empFilter.department = new mongoose.Types.ObjectId(req.query.department);
  const employees = await Employee.find(empFilter).select('firstName lastName employeeId department').populate('department', 'name').lean();
  const ids = employees.map((e) => e._id);
  const agg = await Attendance.aggregate([
    { $match: { employee: { $in: ids }, date: { $gte: start, $lte: end } } },
    { $group: { _id: '$employee', present: { $sum: { $cond: [{ $in: ['$status', ['present', 'work_from_home', 'late', 'early_exit']] }, 1, 0] } }, absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } }, late: { $sum: { $cond: ['$isLate', 1, 0] } }, leave: { $sum: { $cond: [{ $eq: ['$status', 'on_leave'] }, 1, 0] } }, minutes: { $sum: '$workedMinutes' }, otMinutes: { $sum: '$overtimeMinutes' } } },
  ]);
  const byId = agg.reduce((a, r) => ({ ...a, [r._id]: r }), {});
  const rows = employees.map((e) => {
    const r = byId[e._id] || {};
    return {
      employeeId: e.employeeId, name: `${e.firstName} ${e.lastName}`, department: e.department?.name,
      present: r.present || 0, absent: r.absent || 0, late: r.late || 0, onLeave: r.leave || 0,
      workedHours: Math.round(((r.minutes || 0) / 60) * 10) / 10, overtimeHours: Math.round(((r.otMinutes || 0) / 60) * 10) / 10,
    };
  });
  const summary = {
    totalEmployees: employees.length,
    avgPresent: rows.length ? Math.round((rows.reduce((s, r) => s + r.present, 0) / rows.length) * 10) / 10 : 0,
    totalAbsent: rows.reduce((s, r) => s + r.absent, 0),
    totalLate: rows.reduce((s, r) => s + r.late, 0),
    totalOvertimeHours: Math.round(rows.reduce((s, r) => s + r.overtimeHours, 0) * 10) / 10,
  };
  if (req.query.export === 'csv') return sendCSV(res, `attendance-report-${year}-${month}.csv`, rows);
  return respond.ok(res, { year, month, rows, summary });
}));

/* ── TRENDS (last N days company-wide) ────────────────────────────── */
router.get('/reports/trend', requirePermission('attendance:view'), asyncHandler(async (req, res) => {
  const days = Math.min(90, parseInt(req.query.days, 10) || 30);
  const start = T.dateKey(new Date(Date.now() - (days - 1) * 86400000));
  const agg = await Attendance.aggregate([
    { $match: { date: { $gte: start } } },
    { $group: { _id: '$date', present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late', 'early_exit', 'work_from_home']] }, 1, 0] } }, absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } }, late: { $sum: { $cond: ['$isLate', 1, 0] } }, onLeave: { $sum: { $cond: [{ $eq: ['$status', 'on_leave'] }, 1, 0] } }, avgMinutes: { $avg: '$workedMinutes' } } },
    { $sort: { _id: 1 } },
  ]);
  return respond.list(res, agg.map((a) => ({ date: a._id, present: a.present, absent: a.absent, late: a.late, onLeave: a.onLeave, avgHours: Math.round(((a.avgMinutes || 0) / 60) * 10) / 10 })), { total: agg.length });
}));

/* ── CORRECTION REQUESTS ──────────────────────────────────────────── */
router.post('/corrections', requirePermission('attendance:create', 'attendance:update'), validate({ body: z.object({
  date: z.coerce.date(), checkIn: z.coerce.date().optional(), checkOut: z.coerce.date().optional(), reason: z.string().min(5), status: z.string().optional(),
}) }), asyncHandler(async (req, res) => {
  const empId = await ensureSelf(req);
  const settings = await getSettings();
  const day = T.dateKey(req.body.date, settings.timezone || 'Asia/Kolkata');
  const windowDays = settings?.attendancePolicy?.correctionWindowDays ?? 7;
  if (day > todayKey(settings)) throw ApiError.badRequest('You cannot request a correction for a future date');
  if (T.minutesBetween(day, new Date()) > windowDays * 1440) throw ApiError.badRequest(`Corrections can only be requested within ${windowDays} days (company policy). Ask HR for an adjustment.`);
  let record = await Attendance.findOne({ employee: empId, date: day });
  if (!record) record = new Attendance({ employee: empId, date: day, status: 'absent' });
  if (record.corrections.some((c) => c.status === 'pending')) throw ApiError.conflict('You already have a pending correction for this date');
  record.corrections.push({ requestedBy: req.user._id, reason: req.body.reason, proposed: { checkIn: req.body.checkIn, checkOut: req.body.checkOut, status: req.body.status } });
  record.auditTrail.push({ by: req.user._id, action: 'correction_requested', note: req.body.reason });
  await record.save();
  const mgr = await Employee.findById(empId).select('reportingManager firstName lastName').lean();
  const mgrUser = mgr?.reportingManager ? await Employee.findById(mgr.reportingManager).select('user').lean() : null;
  await notify({ userId: mgrUser?.user, title: 'Attendance correction request', body: `${mgr.firstName} ${mgr.lastName} requested a correction for ${day.toISOString().slice(0, 10)}.`, type: 'attendance', link: '/attendance/corrections', sendEmail: true });
  return respond.created(res, record.corrections[record.corrections.length - 1], 'Correction request submitted for approval');
}));

router.get('/corrections/pending', requirePermission('attendance:view'), asyncHandler(async (req, res) => {
  const filter = { 'corrections.status': 'pending' };
  if (!req.scope.isGlobal) {
    const ids = [req.scope.selfEmployeeId, ...(await directReportIds(req.scope.selfEmployeeId))].filter(Boolean);
    filter.employee = { $in: ids };
  }
  const items = await Attendance.find(filter).populate('employee', 'firstName lastName employeeId').lean();
  const rows = items.flatMap((a) => a.corrections.filter((c) => c.status === 'pending').map((c) => ({ attendanceId: a._id, date: a.date, employee: a.employee, correction: c })));
  return respond.list(res, rows, { total: rows.length });
}));

router.post('/corrections/:attendanceId/:correctionId/decide', requirePermission('attendance:approve', 'attendance:update'), validate({ body: z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().optional() }) }),
  asyncHandler(async (req, res) => {
    const record = await Attendance.findById(req.params.attendanceId);
    if (!record) throw ApiError.notFound('Attendance record not found');
    const corr = record.corrections.id(req.params.correctionId);
    if (!corr) throw ApiError.notFound('Correction request not found');
    if (corr.status !== 'pending') throw ApiError.badRequest('This request has already been decided');
    if (!req.scope.isGlobal && corr.requestedBy && String(corr.requestedBy) === String(req.user._id)) throw ApiError.forbidden('You cannot approve your own correction request');

    const before = { checkIn: record.checkIn, checkOut: record.checkOut, status: record.status };
    corr.status = req.body.decision;
    corr.decidedBy = req.user._id; corr.decidedAt = new Date(); corr.decisionNote = req.body.note;
    if (req.body.decision === 'approved') {
      if (corr.proposed.checkIn) record.checkIn = corr.proposed.checkIn;
      if (corr.proposed.checkOut) record.checkOut = corr.proposed.checkOut;
      if (corr.proposed.status) record.status = corr.proposed.status;
      const settings = await getSettings();
      const emp = await Employee.findById(record.employee).populate('shift');
      computeMetrics(record, emp?.shift, settings);
      record.adjustedBy = req.user._id; record.adjustmentReason = corr.reason;
    }
    record.auditTrail.push({ by: req.user._id, action: `correction_${req.body.decision}`, before, after: { checkIn: record.checkIn, checkOut: record.checkOut, status: record.status }, note: req.body.note });
    await record.save();
    const emp = await Employee.findById(record.employee).select('user firstName').lean();
    await notify({ userId: emp?.user, title: `Attendance correction ${req.body.decision}`, body: `Your correction for ${new Date(record.date).toISOString().slice(0, 10)} was ${req.body.decision}.${req.body.note ? ` Note: ${req.body.note}` : ''}`, type: 'attendance', link: '/attendance', sendEmail: true });
    await recordAudit(req, { action: `attendance.correction_${req.body.decision}`, module: 'attendance', targetModel: 'Attendance', targetId: record._id, description: `Correction ${req.body.decision} for employee ${record.employee}`, severity: 'warning' });
    return respond.ok(res, record, `Correction ${req.body.decision}`);
  })
);

/* ── HR ADJUSTMENT (direct, audited) ──────────────────────────────── */
router.post('/adjust', requirePermission('attendance:update'), validate({ body: z.object({
  employeeId: z.string(), date: z.coerce.date(), status: z.enum(['present', 'absent', 'half_day', 'late', 'early_exit', 'on_leave', 'holiday', 'weekly_off', 'work_from_home', 'od']).optional(),
  checkIn: z.coerce.date().optional().nullable(), checkOut: z.coerce.date().optional().nullable(), remarks: z.string().min(3),
}) }), asyncHandler(async (req, res) => {
  const settings = await getSettings();
  const day = T.dateKey(req.body.date, settings.timezone || 'Asia/Kolkata');
  const employee = await Employee.findById(req.body.employeeId).populate('shift');
  if (!employee) throw ApiError.notFound('Employee not found');
  let record = await Attendance.findOne({ employee: employee._id, date: day });
  const before = record ? { checkIn: record.checkIn, checkOut: record.checkOut, status: record.status } : null;
  if (!record) record = new Attendance({ employee: employee._id, date: day, source: 'manual' });
  if (req.body.status) record.status = req.body.status;
  if (req.body.checkIn !== undefined) record.checkIn = req.body.checkIn;
  if (req.body.checkOut !== undefined) record.checkOut = req.body.checkOut;
  record.adjustedBy = req.user._id; record.adjustmentReason = req.body.remarks;
  computeMetrics(record, employee.shift, settings);
  record.auditTrail.push({ by: req.user._id, action: 'hr_adjustment', before, after: { checkIn: record.checkIn, checkOut: record.checkOut, status: record.status }, note: req.body.remarks });
  await record.save();
  await recordAudit(req, { action: 'attendance.adjust', module: 'attendance', targetModel: 'Attendance', targetId: record._id, description: `Adjusted attendance for ${employee.fullName} on ${day.toISOString().slice(0, 10)}: ${req.body.remarks}`, severity: 'critical' });
  await notify({ userId: employee.user, title: 'Attendance updated by HR', body: `Your attendance for ${day.toISOString().slice(0, 10)} was adjusted. Reason: ${req.body.remarks}`, type: 'attendance', link: '/attendance' });
  return respond.ok(res, record, 'Attendance adjusted');
}));

/* ── MARK ABSENT (batch job / HR trigger) ─────────────────────────── */
router.post('/jobs/mark-absent', requirePermission('attendance:update'), validate({ body: z.object({ date: z.coerce.date().optional() }) }), asyncHandler(async (req, res) => {
  const settings = await getSettings();
  const day = T.dateKey(req.body.date || new Date(Date.now() - 86400000), settings.timezone || 'Asia/Kolkata');
  const workingDays = settings?.workingDays || [1, 2, 3, 4, 5];
  if (!workingDays.includes(day.getUTCDay())) return respond.ok(res, { marked: 0 }, 'Selected date is a weekly off — nothing to mark');
  const holiday = await Holiday.findOne({ date: day, isActive: true }).lean();
  if (holiday) return respond.ok(res, { marked: 0 }, `${holiday.name} is a holiday — nothing to mark`);

  const [employees, leaveIds, existing] = await Promise.all([
    Employee.find({ deletedAt: null, isActive: true, employmentStatus: { $nin: ['terminated', 'resigned', 'retired'] } }).select('_id').lean(),
    LeaveRequest.distinct('employee', { status: { $in: ['approved', 'hr_approved'] }, startDate: { $lte: day }, endDate: { $gte: day } }),
    Attendance.distinct('employee', { date: day }),
  ]);
  const existingSet = new Set(existing.map(String));
  const leaveSet = new Set(leaveIds.map(String));
  const toCreate = employees.filter((e) => !existingSet.has(String(e._id)) && !leaveSet.has(String(e._id)))
    .map((e) => ({ employee: e._id, date: day, status: 'absent', source: 'import', remarks: 'Auto-marked absent (no check-in)' }));
  const leaveRecords = employees.filter((e) => leaveSet.has(String(e._id)) && !existingSet.has(String(e._id)))
    .map((e) => ({ employee: e._id, date: day, status: 'on_leave', source: 'import', remarks: 'Approved leave' }));
  const created = await Attendance.insertMany([...toCreate, ...leaveRecords], { ordered: false }).catch((e) => e.insertedDocs || []);
  await recordAudit(req, { action: 'attendance.auto_absent', module: 'attendance', description: `Auto-marked attendance for ${day.toISOString().slice(0, 10)}: ${toCreate.length} absent, ${leaveRecords.length} on leave`, severity: 'warning' });
  return respond.ok(res, { date: day, markedAbsent: toCreate.length, markedOnLeave: leaveRecords.length, total: created.length }, 'Attendance marking completed');
}));

/* ── GET ONE ──────────────────────────────────────────────────────── */
router.get('/:id', requirePermission('attendance:view'), asyncHandler(async (req, res) => {
  const record = await Attendance.findById(req.params.id).populate(POPULATE).lean();
  if (!record) throw ApiError.notFound('Attendance record not found');
  if (!req.scope.isGlobal && String(record.employee?._id) !== String(req.scope.selfEmployeeId)) await assertCanActOnEmployee(req, record.employee._id);
  return respond.ok(res, record);
}));

module.exports = router;
