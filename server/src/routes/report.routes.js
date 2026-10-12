'use strict';
const express = require('express');
const mongoose = require('mongoose');
const { Employee, Attendance, LeaveRequest, LeaveBalance, Payslip, JobApplication, JobOpening, Task, Project, TrainingAssignment, Asset, Reimbursement, Timesheet, PerformanceReview, Onboarding, Department, Designation } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const { requirePermission } = require('../middleware/auth');
const { sendCSV } = require('../utils/csv');
const T = require('../utils/time');

const router = express.Router();
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Resolves common filters (date range, department, employee) into a match object. */
async function commonFilter(req, { dateField = 'createdAt' } = {}) {
  const match = { deletedAt: null };
  if (req.query.department) match.department = oid(req.query.department);
  if (req.query.employee) match._id = oid(req.query.employee);
  if (req.query.from || req.query.to) {
    match[dateField] = {};
    if (req.query.from) match[dateField].$gte = new Date(req.query.from);
    if (req.query.to) match[dateField].$lte = new Date(new Date(req.query.to).setHours(23, 59, 59, 999));
  }
  return match;
}
const out = (req, res, rows, filename, columns) => {
  if (req.query.export === 'csv') {
    sendCSV(res, filename, rows, columns);
    return true; // response already sent
  }
  return undefined; // let the caller send the aggregate payload
};

/* ── 1. Headcount & employee status ───────────────────────────────── */
router.get('/headcount', requirePermission('reports:view'), asyncHandler(async (req, res) => {
  const base = { deletedAt: null };
  if (req.query.department) base.department = oid(req.query.department);
  const [byStatus, byDepartment, byDesignation, byType, byLocation, genderSplit] = await Promise.all([
    Employee.aggregate([{ $match: base }, { $group: { _id: '$employmentStatus', count: { $sum: 1 } } }]),
    Employee.aggregate([{ $match: base }, { $group: { _id: '$department', count: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } } } }, { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } }, { $unwind: { path: '$d', preserveNullAndEmptyArrays: true } }, { $project: { department: { $ifNull: ['$d.name', 'Unassigned'] }, count: 1, active: 1, _id: 0 } }, { $sort: { count: -1 } }]),
    Employee.aggregate([{ $match: base }, { $group: { _id: '$designation', count: { $sum: 1 } } }, { $lookup: { from: 'designations', localField: '_id', foreignField: '_id', as: 'd' } }, { $unwind: { path: '$d', preserveNullAndEmptyArrays: true } }, { $project: { designation: { $ifNull: ['$d.title', 'Unassigned'] }, count: 1, _id: 0 } }, { $sort: { count: -1 } }]),
    Employee.aggregate([{ $match: base }, { $group: { _id: '$employmentType', count: { $sum: 1 } } }]),
    Employee.aggregate([{ $match: base }, { $group: { _id: '$workLocation', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Employee.aggregate([{ $match: base }, { $group: { _id: '$gender', count: { $sum: 1 } } }]),
  ]);
  const total = byStatus.reduce((s, x) => s + x.count, 0);
  const rows = byDepartment.map((d) => ({ department: d.department, headcount: d.count, active: d.active, share: total ? `${r2((d.count / total) * 100)}%` : '0%' }));
  return out(req, res, rows, 'headcount-report.csv', [{ key: 'department', label: 'Department' }, { key: 'headcount', label: 'Headcount' }, { key: 'active', label: 'Active' }, { key: 'share', label: 'Share' }]) ?? respond.ok(res, { total, byStatus, byDepartment, byDesignation, byType, byLocation, genderSplit });
}));

/* ── 2. Joiners & exits (attrition) ──────────────────────────────── */
router.get('/attrition', requirePermission('reports:view'), asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const [joiners, exits, monthly, byDepartment, byReason, averageTenure] = await Promise.all([
    Employee.countDocuments({ deletedAt: null, joiningDate: { $gte: new Date(Date.UTC(year, 0, 1)), $lte: new Date(Date.UTC(year, 11, 31)) } }),
    Employee.countDocuments({ lastWorkingDay: { $gte: new Date(Date.UTC(year, 0, 1)), $lte: new Date(Date.UTC(year, 11, 31)) } }),
    Employee.aggregate([
      { $match: { $or: [{ joiningDate: { $gte: new Date(Date.UTC(year, 0, 1)) } }, { lastWorkingDay: { $gte: new Date(Date.UTC(year, 0, 1)) } }] } },
      { $project: { joinMonth: { $month: '$joiningDate' }, exitMonth: { $month: '$lastWorkingDay' }, joined: { $eq: [{ $year: '$joiningDate' }, year] }, exited: { $eq: [{ $year: '$lastWorkingDay' }, year] } } },
      { $facet: {
        joins: [{ $match: { joined: true } }, { $group: { _id: '$joinMonth', count: { $sum: 1 } } }],
        exits: [{ $match: { exited: true } }, { $group: { _id: '$exitMonth', count: { $sum: 1 } } }],
      } },
    ]),
    Employee.aggregate([{ $match: { lastWorkingDay: { $gte: new Date(Date.UTC(year, 0, 1)) } } }, { $group: { _id: '$department', exits: { $sum: 1 } } }, { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } }, { $unwind: { path: '$d', preserveNullAndEmptyArrays: true } }, { $project: { department: { $ifNull: ['$d.name', 'Unassigned'] }, exits: 1, _id: 0 } }]),
    Employee.aggregate([{ $match: { lastWorkingDay: { $gte: new Date(Date.UTC(year, 0, 1)) }, exitReason: { $ne: null } } }, { $group: { _id: '$exitReason', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Employee.aggregate([{ $match: { lastWorkingDay: { $ne: null }, deletedAt: null } }, { $project: { tenure: { $divide: [{ $subtract: ['$lastWorkingDay', '$joiningDate'] }, 31557600000] } } }, { $group: { _id: null, avg: { $avg: '$tenure' } } }]),
  ]);
  const avgHeadcount = await Employee.countDocuments({ deletedAt: null, joiningDate: { $lte: new Date(Date.UTC(year, 11, 31)) } });
  const turnover = avgHeadcount ? r2((exits / avgHeadcount) * 100) : 0;
  const rows = Array.from({ length: 12 }).map((_, i) => ({
    month: T.MONTHS[i],
    joiners: monthly[0]?.joins?.find((j) => j._id === i + 1)?.count || 0,
    exits: monthly[0]?.exits?.find((e) => e._id === i + 1)?.count || 0,
  }));
  if (req.query.export === 'csv') return sendCSV(res, `attrition-${year}.csv`, rows);
  return respond.ok(res, { year, joiners, exits, turnoverPercent: turnover, averageTenureYears: r2(averageTenure[0]?.avg || 0), monthly: rows, byDepartment, byReason });
}));

/* ── 3. Attendance report ────────────────────────────────────────── */
router.get('/attendance', requirePermission('reports:view'), asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
  const { start, end } = T.monthRange(year, month);
  const empFilter = { deletedAt: null };
  if (req.query.department) empFilter.department = oid(req.query.department);
  const employees = await Employee.find(empFilter).select('firstName lastName employeeId department').populate('department', 'name').lean();
  const agg = await Attendance.aggregate([
    { $match: { employee: { $in: employees.map((e) => e._id) }, date: { $gte: start, $lte: end } } },
    { $group: { _id: '$employee', present: { $sum: { $cond: [{ $in: ['$status', ['present', 'work_from_home', 'od']] }, 1, 0] } }, late: { $sum: { $cond: ['$isLate', 1, 0] } }, absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } }, halfDay: { $sum: { $cond: [{ $eq: ['$status', 'half_day'] }, 1, 0] } }, leave: { $sum: { $cond: [{ $eq: ['$status', 'on_leave'] }, 1, 0] } }, minutes: { $sum: '$workedMinutes' }, ot: { $sum: '$overtimeMinutes' } } },
  ]);
  const byId = agg.reduce((a, x) => ({ ...a, [x._id]: x }), {});
  const rows = employees.map((e) => {
    const x = byId[e._id] || {};
    const total = (x.present || 0) + (x.late || 0) + (x.absent || 0) + (x.leave || 0) + (x.halfDay || 0);
    return {
      employeeId: e.employeeId, name: `${e.firstName} ${e.lastName}`, department: e.department?.name,
      present: (x.present || 0) + (x.late || 0), absent: x.absent || 0, late: x.late || 0, halfDay: x.halfDay || 0, onLeave: x.leave || 0,
      workedHours: r2((x.minutes || 0) / 60), overtimeHours: r2((x.ot || 0) / 60),
      attendancePercent: total ? r2((((x.present || 0) + (x.late || 0) + (x.halfDay || 0) * 0.5) / total) * 100) : 0,
    };
  });
  return out(req, res, rows, `attendance-report-${year}-${String(month).padStart(2, '0')}.csv`) ?? respond.ok(res, { year, month, rows });
}));

/* ── 4. Leave report ─────────────────────────────────────────────── */
router.get('/leave', requirePermission('reports:view'), asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const filter = { year };
  if (req.query.department) {
    const ids = await Employee.distinct('_id', { department: oid(req.query.department) });
    filter.employee = { $in: ids };
  }
  const [byType, byStatus, byDepartment, balances] = await Promise.all([
    LeaveRequest.aggregate([{ $match: filter }, { $group: { _id: '$leaveType', days: { $sum: '$totalDays' }, requests: { $sum: 1 } } }, { $lookup: { from: 'leavetypes', localField: '_id', foreignField: '_id', as: 't' } }, { $unwind: '$t' }, { $project: { leaveType: '$t.name', days: 1, requests: 1, _id: 0 } }, { $sort: { days: -1 } }]),
    LeaveRequest.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 }, days: { $sum: '$totalDays' } } }]),
    LeaveRequest.aggregate([
      { $match: filter }, { $lookup: { from: 'employees', localField: 'employee', foreignField: '_id', as: 'e' } }, { $unwind: '$e' },
      { $group: { _id: '$e.department', days: { $sum: '$totalDays' }, employees: { $addToSet: '$employee' } } },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } }, { $unwind: { path: '$d', preserveNullAndEmptyArrays: true } },
      { $project: { department: { $ifNull: ['$d.name', 'Unassigned'] }, days: 1, employees: { $size: '$employees' }, _id: 0 } },
    ]),
    LeaveBalance.aggregate([{ $match: { year } }, { $group: { _id: '$leaveType', allocated: { $sum: '$allocated' }, used: { $sum: '$used' }, pending: { $sum: '$pending' }, carried: { $sum: '$carriedForward' } } }, { $lookup: { from: 'leavetypes', localField: '_id', foreignField: '_id', as: 't' } }, { $unwind: '$t' }, { $project: { leaveType: '$t.name', allocated: 1, used: 1, pending: 1, carried: 1, utilization: { $cond: [{ $gt: ['$allocated', 0] }, { $round: [{ $multiply: [{ $divide: ['$used', '$allocated'] }, 100] }, 1] }, 0] }, _id: 0 } }]),
  ]);
  if (req.query.export === 'csv') return sendCSV(res, `leave-report-${year}.csv`, balances);
  return respond.ok(res, { year, byType, byStatus, byDepartment, balances });
}));

/* ── 5. Payroll report ───────────────────────────────────────────── */
router.get('/payroll', requirePermission('reports:view', 'payroll:view'), asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const monthly = await Payslip.aggregate([{ $match: { year } }, { $group: { _id: '$month', gross: { $sum: '$grossEarnings' }, deductions: { $sum: '$totalDeductions' }, net: { $sum: '$netPay' }, overtime: { $sum: '$overtimeAmount' }, employees: { $sum: 1 }, lopDays: { $sum: '$lopDays' } } }, { $sort: { _id: 1 } }]);
  const rows = monthly.map((m) => ({ month: T.MONTHS[m._id - 1], employees: m.employees, gross: m.gross, deductions: m.deductions, net: m.net, overtime: m.overtime, lopDays: m.lopDays }));
  const totals = rows.reduce((a, r) => ({ gross: a.gross + r.gross, net: a.net + r.net, deductions: a.deductions + r.deductions, overtime: a.overtime + r.overtime }), { gross: 0, net: 0, deductions: 0, overtime: 0 });
  if (req.query.export === 'csv') return sendCSV(res, `payroll-report-${year}.csv`, rows);
  return respond.ok(res, { year, monthly: rows, totals: { ...totals, gross: r2(totals.gross), net: r2(totals.net), deductions: r2(totals.deductions) } });
}));

/* ── 6. Recruitment report ───────────────────────────────────────── */
router.get('/recruitment', requirePermission('reports:view'), asyncHandler(async (req, res) => {
  const [funnel, byDepartment, bySource, openings, offers] = await Promise.all([
    JobApplication.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
    JobOpening.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$department', openings: { $sum: '$openings' }, filled: { $sum: '$vacanciesFilled' }, positions: { $sum: 1 } } }, { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } }, { $unwind: { path: '$d', preserveNullAndEmptyArrays: true } }, { $project: { department: { $ifNull: ['$d.name', 'Unassigned'] }, openings: 1, filled: 1, positions: 1, _id: 0 } }]),
    JobApplication.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$source', applied: { $sum: 1 }, hired: { $sum: { $cond: [{ $eq: ['$stage', 'hired'] }, 1, 0] } } } }, { $sort: { applied: -1 } }]),
    JobOpening.find({ deletedAt: null, status: 'open' }).select('title jobCode openings vacanciesFilled department priority').populate('department', 'name').lean(),
    JobApplication.aggregate([{ $match: { 'offer.status': { $in: ['sent', 'accepted', 'declined'] } } }, { $group: { _id: '$offer.status', count: { $sum: 1 }, avgCtc: { $avg: '$offer.ctc' } } }]),
  ]);
  if (req.query.export === 'csv') return sendCSV(res, 'recruitment-report.csv', byDepartment);
  return respond.ok(res, { funnel, byDepartment, bySource, openPositions: openings, offers: offers.map((o) => ({ status: o._id, count: o.count, avgCtc: r2(o.avgCtc) })) });
}));

/* ── 7. Projects & tasks ─────────────────────────────────────────── */
router.get('/projects', requirePermission('reports:view'), asyncHandler(async (req, res) => {
  const projects = await Project.find({ deletedAt: null }).select('name code status manager startDate endDate budget').populate('manager', 'firstName lastName').lean();
  const taskAgg = await Task.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$project', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, overdue: { $sum: { $cond: [{ $and: [{ $lt: ['$dueDate', new Date()] }, { $ne: ['$status', 'completed'] }] }, 1, 0] } }, hours: { $sum: '$loggedHours' } } }]);
  const byId = taskAgg.reduce((a, t) => ({ ...a, [t._id]: t }), {});
  const rows = projects.map((p) => ({
    project: p.name, code: p.code, status: p.status, manager: p.manager ? `${p.manager.firstName} ${p.manager.lastName}` : '',
    tasks: byId[p._id]?.total || 0, completed: byId[p._id]?.completed || 0, overdue: byId[p._id]?.overdue || 0,
    hours: byId[p._id]?.hours || 0, progress: byId[p._id]?.total ? r2((byId[p._id].completed / byId[p._id].total) * 100) : 0,
    budget: p.budget?.amount || 0,
  }));
  return out(req, res, rows, 'project-report.csv') ?? respond.ok(res, { rows });
}));

/* ── 8. Training report ──────────────────────────────────────────── */
router.get('/training', requirePermission('reports:view'), asyncHandler(async (req, res) => {
  const [byStatus, byCategory, byDepartment] = await Promise.all([
    TrainingAssignment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    TrainingAssignment.aggregate([{ $lookup: { from: 'trainingprograms', localField: 'program', foreignField: '_id', as: 'p' } }, { $unwind: '$p' }, { $group: { _id: '$p.category', enrolled: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, hours: { $sum: '$p.durationHours' } } }]),
    TrainingAssignment.aggregate([{ $lookup: { from: 'employees', localField: 'employee', foreignField: '_id', as: 'e' } }, { $unwind: '$e' }, { $group: { _id: '$e.department', enrolled: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } }, { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } }, { $unwind: { path: '$d', preserveNullAndEmptyArrays: true } }, { $project: { department: { $ifNull: ['$d.name', 'Unassigned'] }, enrolled: 1, completed: 1, _id: 0 } }]),
  ]);
  return respond.ok(res, { byStatus, byCategory, byDepartment });
}));

/* ── 9. Assets report ────────────────────────────────────────────── */
router.get('/assets', requirePermission('reports:view'), asyncHandler(async (req, res) => {
  const [byCategory, byStatus, value] = await Promise.all([
    Asset.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$category', count: { $sum: 1 }, value: { $sum: '$purchasePrice' } } }, { $sort: { count: -1 } }]),
    Asset.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Asset.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: null, total: { $sum: '$purchasePrice' }, avgAge: { $avg: { $divide: [{ $subtract: [new Date(), '$purchaseDate'] }, 31557600000] } } } }]),
  ]);
  return respond.ok(res, { byCategory, byStatus, totalValue: r2(value[0]?.total || 0), avgAgeYears: r2(value[0]?.avgAge || 0) });
}));

/* ── 10. Reimbursements report ───────────────────────────────────── */
router.get('/reimbursements', requirePermission('reports:view'), asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const match = { expenseDate: { $gte: new Date(Date.UTC(year, 0, 1)), $lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59)) } };
  const [byCategory, byDepartment, monthly, byStatus] = await Promise.all([
    Reimbursement.aggregate([{ $match: match }, { $group: { _id: '$category', claims: { $sum: 1 }, claimed: { $sum: '$amount' }, approved: { $sum: '$approvedAmount' } } }, { $sort: { claimed: -1 } }]),
    Reimbursement.aggregate([{ $match: match }, { $lookup: { from: 'employees', localField: 'employee', foreignField: '_id', as: 'e' } }, { $unwind: '$e' }, { $group: { _id: '$e.department', claims: { $sum: 1 }, amount: { $sum: '$amount' } } }, { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } }, { $unwind: { path: '$d', preserveNullAndEmptyArrays: true } }, { $project: { department: { $ifNull: ['$d.name', 'Unassigned'] }, claims: 1, amount: 1, _id: 0 } }]),
    Reimbursement.aggregate([{ $match: match }, { $group: { _id: { $month: '$expenseDate' }, amount: { $sum: '$amount' }, claims: { $sum: 1 } } }, { $sort: { '_id': 1 } }]),
    Reimbursement.aggregate([{ $match: match }, { $group: { _id: '$status', claims: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
  ]);
  if (req.query.export === 'csv') return sendCSV(res, `reimbursement-report-${year}.csv`, byCategory);
  return respond.ok(res, { year, byCategory, byDepartment, monthly: monthly.map((m) => ({ month: T.MONTHS[m._id - 1], amount: m.amount, claims: m.claims })), byStatus });
}));

/* ── 11. Performance report ──────────────────────────────────────── */
router.get('/performance', requirePermission('reports:view'), asyncHandler(async (req, res) => {
  const match = req.query.cycle ? { cycle: req.query.cycle } : {};
  const [distribution, byDepartment, topPerformers, cycles] = await Promise.all([
    PerformanceReview.aggregate([{ $match: match }, { $group: { _id: '$finalRating', count: { $sum: 1 } } }, { $sort: { _id: -1 } }]),
    PerformanceReview.aggregate([{ $match: match }, { $lookup: { from: 'employees', localField: 'employee', foreignField: '_id', as: 'e' } }, { $unwind: '$e' }, { $group: { _id: '$e.department', avgRating: { $avg: '$finalRating' }, reviews: { $sum: 1 } } }, { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } }, { $unwind: { path: '$d', preserveNullAndEmptyArrays: true } }, { $project: { department: { $ifNull: ['$d.name', 'Unassigned'] }, avgRating: { $round: ['$avgRating', 2] }, reviews: 1, _id: 0 } }]),
    PerformanceReview.find({ ...match, finalRating: { $gte: 4 } }).populate('employee', 'firstName lastName employeeId department designation').sort('-finalRating').limit(20).lean(),
    PerformanceReview.distinct('cycle'),
  ]);
  return respond.ok(res, { distribution, byDepartment, topPerformers, cycles });
}));

/* ── 12. Onboarding / offboarding status ─────────────────────────── */
router.get('/onboarding-status', requirePermission('reports:view'), asyncHandler(async (req, res) => {
  const [byStatus, avgCompletion, stalled] = await Promise.all([
    Onboarding.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, avgProgress: { $avg: '$progressPercent' } } }]),
    Onboarding.aggregate([{ $match: { status: 'completed' } }, { $project: { days: { $divide: [{ $subtract: ['$completedAt', '$startDate'] }, 86400000] } } }, { $group: { _id: null, avgDays: { $avg: '$days' } } }]),
    Onboarding.find({ status: 'in_progress', targetCompletionDate: { $lt: new Date() } }).populate('employee', 'firstName lastName employeeId joiningDate').lean(),
  ]);
  return respond.ok(res, { byStatus, avgDaysToComplete: r2(avgCompletion[0]?.avgDays || 0), stalled });
}));

/* ── 13. Department-wise comparison ──────────────────────────────── */
router.get('/departments', requirePermission('reports:view'), asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const depts = await Department.find({ deletedAt: null }).select('name code budget').lean();
  const [headcount, attendance, leaveDays, payroll] = await Promise.all([
    Employee.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$department', headcount: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } }]),
    Attendance.aggregate([{ $lookup: { from: 'employees', localField: 'employee', foreignField: '_id', as: 'e' } }, { $unwind: '$e' }, { $match: { date: { $gte: new Date(Date.UTC(year, 0, 1)) } } }, { $group: { _id: '$e.department', present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late', 'work_from_home']] }, 1, 0] } }, absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } }, late: { $sum: { $cond: ['$isLate', 1, 0] } }, minutes: { $sum: '$workedMinutes' } } }]),
    LeaveRequest.aggregate([{ $match: { year, status: 'approved' } }, { $lookup: { from: 'employees', localField: 'employee', foreignField: '_id', as: 'e' } }, { $unwind: '$e' }, { $group: { _id: '$e.department', days: { $sum: '$totalDays' } } }]),
    Payslip.aggregate([{ $match: { year } }, { $lookup: { from: 'employees', localField: 'employee', foreignField: '_id', as: 'e' } }, { $unwind: '$e' }, { $group: { _id: '$e.department', net: { $sum: '$netPay' }, employees: { $addToSet: '$employee' } } }]),
  ]);
  const rows = depts.map((d) => {
    const hc = headcount.find((h) => String(h._id) === String(d._id));
    const at = attendance.find((a) => String(a._id) === String(d._id));
    const lv = leaveDays.find((l) => String(l._id) === String(d._id));
    const py = payroll.find((p) => String(p._id) === String(d._id));
    return {
      department: d.name, code: d.code, headcount: hc?.headcount || 0, active: hc?.active || 0,
      presentDays: at?.present || 0, absentDays: at?.absent || 0, lateCount: at?.late || 0,
      avgDailyHours: at ? r2(((at.minutes || 0) / 60) / Math.max(1, (at.present || 0) + (at.absent || 0))) : 0,
      leaveDays: lv?.days || 0, monthlyPayroll: r2((py?.net || 0) / 12), payrollEmployees: py?.employees?.length || 0,
      annualBudget: d.budget?.annual || 0,
    };
  });
  return out(req, res, rows, `department-report-${year}.csv`) ?? respond.ok(res, { year, rows });
}));

/* ── 14. Timesheet report ────────────────────────────────────────── */
router.get('/timesheets', requirePermission('reports:view'), asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const [byProject, byEmployee, byStatus] = await Promise.all([
    Timesheet.aggregate([{ $match: { year } }, { $unwind: '$entries' }, { $group: { _id: '$entries.project', hours: { $sum: '$entries.hours' }, billable: { $sum: { $cond: ['$entries.billable', '$entries.hours', 0] } } } }, { $lookup: { from: 'projects', localField: '_id', foreignField: '_id', as: 'p' } }, { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } }, { $project: { project: { $ifNull: ['$p.name', 'Internal / Non-project'] }, hours: 1, billable: 1, _id: 0 } }, { $sort: { hours: -1 } }]),
    Timesheet.aggregate([{ $match: { year } }, { $group: { _id: '$employee', hours: { $sum: '$totalHours' }, billable: { $sum: '$billableHours' }, overtime: { $sum: '$overtimeHours' }, weeks: { $sum: 1 } } }, { $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'e' } }, { $unwind: '$e' }, { $project: { name: { $concat: ['$e.firstName', ' ', '$e.lastName'] }, employeeId: '$e.employeeId', hours: 1, billable: 1, overtime: 1, weeks: 1, _id: 0 } }, { $sort: { hours: -1 } }]),
    Timesheet.aggregate([{ $match: { year } }, { $group: { _id: '$status', count: { $sum: 1 }, hours: { $sum: '$totalHours' } } }]),
  ]);
  if (req.query.export === 'csv') return sendCSV(res, `timesheet-report-${year}.csv`, byEmployee);
  return respond.ok(res, { year, byProject, byEmployee, byStatus });
}));

/* ── 15. Master export (HR pack) ─────────────────────────────────── */
router.get('/master/employees', requirePermission('reports:export'), asyncHandler(async (req, res) => {
  const filter = { deletedAt: null };
  if (req.query.department) filter.department = oid(req.query.department);
  const employees = await Employee.find(filter)
    .select('employeeId firstName lastName email phone gender dateOfBirth joiningDate employmentType employmentStatus employeeCategory workLocation confirmationDate probationEndDate noticePeriodDays lastWorkingDay skills')
    .populate('department', 'name').populate('designation', 'title').populate('reportingManager', 'firstName lastName employeeId')
    .sort('employeeId').lean();
  const rows = employees.map((e) => ({
    employeeId: e.employeeId, firstName: e.firstName, lastName: e.lastName, email: e.email, phone: e.phone,
    gender: e.gender, dateOfBirth: e.dateOfBirth ? new Date(e.dateOfBirth).toISOString().slice(0, 10) : '',
    department: e.department?.name, designation: e.designation?.title,
    reportingManager: e.reportingManager ? `${e.reportingManager.firstName} ${e.reportingManager.lastName}` : '',
    joiningDate: e.joiningDate ? new Date(e.joiningDate).toISOString().slice(0, 10) : '',
    employmentType: e.employmentType, status: e.employmentStatus, category: e.employeeCategory,
    workLocation: e.workLocation, confirmationDate: e.confirmationDate ? new Date(e.confirmationDate).toISOString().slice(0, 10) : '',
    skills: (e.skills || []).map((s) => s.name).join('; '),
  }));
  return sendCSV(res, `employee-master-${new Date().toISOString().slice(0, 10)}.csv`, rows);
}));

module.exports = router;
