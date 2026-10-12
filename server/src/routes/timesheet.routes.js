'use strict';
const express = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const { Timesheet, Employee, Project, Task } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const validate = require('../middleware/validate');
const { requirePermission, scopeFilter, directReportIds } = require('../middleware/auth');
const { buildQuery, paginate } = require('../utils/query');
const { recordAudit } = require('../utils/audit');
const { sendCSV } = require('../utils/csv');
const { notify } = require('../utils/notify');
const T = require('../utils/time');

const router = express.Router();
const POPULATE = [
  { path: 'employee', select: 'firstName lastName employeeId department designation' },
  { path: 'approver', select: 'firstName lastName employeeId' },
  { path: 'entries.project', select: 'name code' },
  { path: 'entries.task', select: 'title' },
];

async function ensureSelf(req) {
  if (req.scope.selfEmployeeId) return req.scope.selfEmployeeId;
  const emp = await Employee.findOne({ user: req.user._id, deletedAt: null }).select('_id');
  if (!emp) throw ApiError.forbidden('Your login is not linked to an employee record.');
  req.scope.selfEmployeeId = emp._id;
  return emp._id;
}

/* ── LIST ─────────────────────────────────────────────────────────── */
router.get('/', requirePermission('timesheets:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: [], filterFields: ['status', 'year', 'employee'], defaultSort: '-weekStart' });
  delete opts.filter.employee;
  Object.assign(opts.filter, await scopeFilter(req, 'employee'));
  if (req.query.employee && req.scope.isGlobal) opts.filter.employee = req.query.employee;
  const { items, meta } = await paginate(Timesheet, opts, { populate: POPULATE });
  if (req.query.export === 'csv') {
    const rows = items.flatMap((t) => t.entries.map((e) => ({
      employeeId: t.employee?.employeeId, name: `${t.employee?.firstName} ${t.employee?.lastName}`,
      week: new Date(t.weekStart).toISOString().slice(0, 10), date: new Date(e.date).toISOString().slice(0, 10),
      project: e.project?.name, task: e.task?.title, hours: e.hours, billable: e.billable, description: e.description, status: t.status,
    })));
    return sendCSV(res, `timesheets-${Date.now()}.csv`, rows);
  }
  return respond.list(res, items, meta);
}));

/** Current (or given) week for the logged-in employee. */
router.get('/me/current', requirePermission('timesheets:view'), asyncHandler(async (req, res) => {
  const empId = await ensureSelf(req);
  const weekStart = req.query.weekStart ? new Date(req.query.weekStart) : T.weekStartOf(new Date());
  const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
  let sheet = await Timesheet.findOne({ employee: empId, weekStart }).populate(POPULATE);
  if (!sheet) {
    sheet = await Timesheet.create({ employee: empId, weekStart, weekEnd, isoWeek: `${weekStart.getUTCFullYear()}-W${Math.ceil((weekStart.getUTCDate()) / 7)}`, year: weekStart.getUTCFullYear(), status: 'draft', entries: [] });
    sheet = await Timesheet.findById(sheet._id).populate(POPULATE);
  }
  return respond.ok(res, sheet);
}));

router.get('/:id', requirePermission('timesheets:view'), asyncHandler(async (req, res) => {
  const sheet = await Timesheet.findById(req.params.id).populate(POPULATE).lean();
  if (!sheet) throw ApiError.notFound('Timesheet not found');
  const isSelf = String(sheet.employee?._id) === String(req.scope.selfEmployeeId);
  if (!isSelf && !req.scope.isGlobal) {
    const ids = [req.scope.selfEmployeeId, ...(await directReportIds(req.scope.selfEmployeeId))].map(String);
    if (!ids.includes(String(sheet.employee?._id))) throw ApiError.forbidden('Not authorised to view this timesheet');
  }
  return respond.ok(res, sheet);
}));

/* ── SAVE / UPDATE ENTRY (draft only) ─────────────────────────────── */
async function assertOwnEditableSheet(req, id) {
  const sheet = await Timesheet.findById(id);
  if (!sheet) throw ApiError.notFound('Timesheet not found');
  if (String(sheet.employee) !== String(await ensureSelf(req))) throw ApiError.forbidden('You can only edit your own timesheet');
  if (!['draft', 'rejected'].includes(sheet.status)) throw ApiError.badRequest(`Timesheet is "${sheet.status}" — it can no longer be edited`);
  return sheet;
}

router.post('/:id/entries', requirePermission('timesheets:create'), validate({ body: z.object({
  date: z.coerce.date(), project: z.string().optional().nullable(), task: z.string().optional().nullable(),
  hours: z.coerce.number().min(0.25, 'Minimum 0.25 hours').max(24, 'A day cannot exceed 24 hours'),
  description: z.string().min(3, 'Describe what you worked on'), billable: z.boolean().optional(), overtime: z.boolean().optional(),
}) }), asyncHandler(async (req, res) => {
  const sheet = await assertOwnEditableSheet(req, req.params.id);
  const day = T.dateKey(req.body.date);
  if (day < new Date(sheet.weekStart) || day > new Date(new Date(sheet.weekStart).getTime() + 6 * 86400000)) throw ApiError.badRequest('Entry date must fall inside this timesheet week');
  // Prevent duplicate project/task/day entries
  const dup = sheet.entries.find((e) => +new Date(e.date) === +day && String(e.project || '') === String(req.body.project || '') && String(e.task || '') === String(req.body.task || ''));
  if (dup) throw ApiError.conflict('An entry for this date, project and task already exists. Edit the existing entry instead.');
  const dayTotal = sheet.entries.filter((e) => +new Date(e.date) === +day).reduce((s, e) => s + e.hours, 0);
  if (dayTotal + req.body.hours > 24) throw ApiError.badRequest(`Total hours for ${day.toISOString().slice(0, 10)} would exceed 24 (currently ${dayTotal})`);
  sheet.entries.push({ ...req.body, date: day });
  if (sheet.status === 'rejected') { sheet.status = 'draft'; sheet.rejectionReason = undefined; }
  sheet.auditTrail.push({ by: req.user._id, action: 'entry_added', note: `${req.body.hours}h on ${day.toISOString().slice(0, 10)}` });
  await sheet.save();
  // keep the task's logged hours in sync
  if (req.body.task) await Task.findByIdAndUpdate(req.body.task, { $inc: { loggedHours: req.body.hours } });
  return respond.created(res, sheet, 'Time entry added');
}));

router.patch('/:id/entries/:entryId', requirePermission('timesheets:create'), asyncHandler(async (req, res) => {
  const sheet = await assertOwnEditableSheet(req, req.params.id);
  const entry = sheet.entries.id(req.params.entryId);
  if (!entry) throw ApiError.notFound('Entry not found');
  const oldHours = entry.hours;
  Object.assign(entry, req.body);
  const day = T.dateKey(entry.date);
  const dayTotal = sheet.entries.filter((e) => +new Date(e.date) === +day && String(e._id) !== String(entry._id)).reduce((s, e) => s + e.hours, 0);
  if (dayTotal + entry.hours > 24) throw ApiError.badRequest('Total hours for that day would exceed 24');
  await sheet.save();
  if (entry.task && oldHours !== entry.hours) await Task.findByIdAndUpdate(entry.task, { $inc: { loggedHours: entry.hours - oldHours } });
  return respond.ok(res, sheet, 'Entry updated');
}));

router.delete('/:id/entries/:entryId', requirePermission('timesheets:create'), asyncHandler(async (req, res) => {
  const sheet = await assertOwnEditableSheet(req, req.params.id);
  const entry = sheet.entries.id(req.params.entryId);
  if (!entry) throw ApiError.notFound('Entry not found');
  const { hours, task } = entry;
  entry.deleteOne();
  await sheet.save();
  if (task) await Task.findByIdAndUpdate(task, { $inc: { loggedHours: -hours } });
  return respond.ok(res, sheet, 'Entry removed');
}));

/* ── SUBMIT ───────────────────────────────────────────────────────── */
router.post('/:id/submit', requirePermission('timesheets:create'), asyncHandler(async (req, res) => {
  const sheet = await assertOwnEditableSheet(req, req.params.id);
  if (!sheet.entries.length) throw ApiError.badRequest('Add at least one time entry before submitting');
  const employee = await Employee.findById(sheet.employee).select('reportingManager').lean();
  sheet.status = 'submitted';
  sheet.submittedAt = new Date();
  sheet.approver = employee?.reportingManager || null;
  sheet.auditTrail.push({ by: req.user._id, action: 'submitted', note: `${sheet.totalHours}h submitted` });
  await sheet.save();
  if (employee?.reportingManager) {
    const mgr = await Employee.findById(employee.reportingManager).select('user').lean();
    await notify({ userId: mgr?.user, title: 'Timesheet submitted for approval', body: `Week of ${new Date(sheet.weekStart).toDateString()}: ${sheet.totalHours}h (${sheet.billableHours}h billable).`, type: 'task', link: `/timesheets/${sheet._id}`, sendEmail: true });
  }
  return respond.ok(res, sheet, 'Timesheet submitted for approval');
}));

/* ── APPROVE / REJECT ─────────────────────────────────────────────── */
router.post('/:id/decide', requirePermission('timesheets:approve', 'timesheets:update'), validate({ body: z.object({
  decision: z.enum(['approved', 'rejected']), comment: z.string().optional(),
}) }), asyncHandler(async (req, res) => {
  const sheet = await Timesheet.findById(req.params.id).populate('employee', 'firstName lastName user reportingManager');
  if (!sheet) throw ApiError.notFound('Timesheet not found');
  if (sheet.status !== 'submitted') throw ApiError.badRequest(`Timesheet is "${sheet.status}" — only submitted timesheets can be decided`);
  if (String(sheet.employee._id) === String(req.scope.selfEmployeeId)) throw ApiError.forbidden('You cannot approve your own timesheet');
  if (!req.scope.isGlobal) {
    const ids = [req.scope.selfEmployeeId, ...(await directReportIds(req.scope.selfEmployeeId))].map(String);
    if (!ids.includes(String(sheet.employee._id))) throw ApiError.forbidden('This employee is not in your team');
  }
  if (req.body.decision === 'rejected' && !req.body.comment) throw ApiError.badRequest('A comment is required when rejecting a timesheet');
  sheet.status = req.body.decision;
  sheet.decidedAt = new Date();
  sheet.approverComment = req.body.comment;
  if (req.body.decision === 'rejected') { sheet.rejectionReason = req.body.comment; sheet.resubmissionCount = (sheet.resubmissionCount || 0) + 1; }
  sheet.auditTrail.push({ by: req.user._id, action: req.body.decision, note: req.body.comment });
  await sheet.save();
  await notify({ userId: sheet.employee.user, title: `Timesheet ${req.body.decision}`, body: `Your timesheet for the week of ${new Date(sheet.weekStart).toDateString()} was ${req.body.decision}.${req.body.comment ? ` Comment: ${req.body.comment}` : ''}`, type: 'task', link: `/timesheets/${sheet._id}`, sendEmail: true });
  await recordAudit(req, { action: `timesheet.${req.body.decision}`, module: 'timesheets', targetId: sheet._id, description: `Timesheet ${req.body.decision} for ${sheet.employee.firstName} ${sheet.employee.lastName}`, severity: 'warning' });
  return respond.ok(res, sheet, `Timesheet ${req.body.decision}`);
}));

/* ── PENDING APPROVALS ────────────────────────────────────────────── */
router.get('/pending/approvals', requirePermission('timesheets:view'), asyncHandler(async (req, res) => {
  const filter = { status: 'submitted' };
  if (!req.scope.isGlobal) filter.employee = { $in: [req.scope.selfEmployeeId, ...(await directReportIds(req.scope.selfEmployeeId))] };
  const items = await Timesheet.find(filter).populate(POPULATE).sort('weekStart').lean();
  return respond.list(res, items, { total: items.length });
}));

/* ── REPORTS ──────────────────────────────────────────────────────── */
router.get('/reports/summary', requirePermission('timesheets:view', 'reports:view'), asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const match = { year };
  if (req.query.department) {
    const ids = await Employee.distinct('_id', { department: req.query.department });
    match.employee = { $in: ids };
  }
  const [byProject, byEmployee, monthly, statusAgg] = await Promise.all([
    Timesheet.aggregate([{ $match: match }, { $unwind: '$entries' }, { $group: { _id: '$entries.project', hours: { $sum: '$entries.hours' }, billable: { $sum: { $cond: ['$entries.billable', '$entries.hours', 0] } }, overtime: { $sum: { $cond: ['$entries.overtime', '$entries.hours', 0] } } } }, { $lookup: { from: 'projects', localField: '_id', foreignField: '_id', as: 'p' } }, { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } }, { $project: { project: { $ifNull: ['$p.name', 'Non-project / Internal'] }, hours: 1, billable: 1, overtime: 1, _id: 0 } }, { $sort: { hours: -1 } }]),
    Timesheet.aggregate([{ $match: match }, { $group: { _id: '$employee', hours: { $sum: '$totalHours' }, billable: { $sum: '$billableHours' }, weeks: { $sum: 1 }, pending: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } } } }, { $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'e' } }, { $unwind: '$e' }, { $project: { name: { $concat: ['$e.firstName', ' ', '$e.lastName'] }, employeeId: '$e.employeeId', hours: 1, billable: 1, weeks: 1, pending: 1, _id: 0 } }, { $sort: { hours: -1 } }]),
    Timesheet.aggregate([{ $match: match }, { $group: { _id: { $month: '$weekStart' }, hours: { $sum: '$totalHours' }, billable: { $sum: '$billableHours' } } }, { $sort: { '_id': 1 } }]),
    Timesheet.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 }, hours: { $sum: '$totalHours' } } }]),
  ]);
  if (req.query.export === 'csv') return sendCSV(res, `timesheet-report-${year}.csv`, byEmployee);
  return respond.ok(res, { year, byProject, byEmployee, monthly: monthly.map((m) => ({ month: T.MONTHS[m._id - 1], hours: m.hours, billable: m.billable })), byStatus: statusAgg });
}));

module.exports = router;
