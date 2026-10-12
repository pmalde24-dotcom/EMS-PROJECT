'use strict';
const express = require('express');
const mongoose = require('mongoose');
const { Employee, Attendance, LeaveRequest, LeaveBalance, Department, Designation, JobOpening, JobApplication, PayrollRun, Payslip, Task, Project, Timesheet, Asset, Reimbursement, TrainingAssignment, Announcement, Notification, Holiday, Onboarding, AuditLog, CompanySettings, LeaveType } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const { requirePermission } = require('../middleware/auth');
const { directReportIds } = require('../middleware/auth');
const T = require('../utils/time');

const router = express.Router();
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

/* ── ADMIN / HR DASHBOARD ─────────────────────────────────────────── */
router.get('/admin', requirePermission('dashboard:view'), asyncHandler(async (req, res) => {
  if (!['super_admin', 'hr_admin', 'hr_manager'].includes(req.user.role)) return respond.forbidden?.(res) ?? res.status(403).json({ success: false, message: 'Admin dashboard is restricted to HR roles' });
  const settings = await CompanySettings.findOne({ singleton: 'company' });
  const today = T.dateKey(new Date(), settings?.timezone);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const empBase = { deletedAt: null };

  const [
    totalEmployees, activeEmployees, inactiveEmployees, newThisMonth, onProbation, noticePeriod,
    todayAttendance, pendingLeaves, departments, designations, openPositions, applicationsThisMonth, hiresThisYear,
    payrollLatest, attendanceTrend, departmentHeadcount, birthdays, anniversaries, recentActivities, exitsThisYear, leaveToday, pendingCorrections,
  ] = await Promise.all([
    Employee.countDocuments(empBase),
    Employee.countDocuments({ ...empBase, isActive: true, employmentStatus: { $nin: ['terminated', 'resigned', 'retired'] } }),
    Employee.countDocuments({ ...empBase, $or: [{ isActive: false }, { employmentStatus: { $in: ['terminated', 'resigned', 'retired', 'inactive'] } }] }),
    Employee.countDocuments({ ...empBase, joiningDate: { $gte: monthStart } }),
    Employee.countDocuments({ ...empBase, employmentStatus: 'probation' }),
    Employee.countDocuments({ ...empBase, employmentStatus: 'notice_period' }),
    Attendance.aggregate([{ $match: { date: today } }, { $group: { _id: '$status', count: { $sum: 1 }, late: { $sum: { $cond: ['$isLate', 1, 0] } }, otMinutes: { $sum: '$overtimeMinutes' }, avgMinutes: { $avg: '$workedMinutes' } } }]),
    LeaveRequest.countDocuments({ status: { $in: ['pending', 'manager_approved'] } }),
    Department.countDocuments({ deletedAt: null }),
    Designation.countDocuments({ deletedAt: null }),
    JobOpening.countDocuments({ deletedAt: null, status: 'open' }),
    JobApplication.countDocuments({ deletedAt: null, appliedAt: { $gte: monthStart } }),
    JobApplication.countDocuments({ deletedAt: null, stage: 'hired', updatedAt: { $gte: yearStart } }),
    PayrollRun.findOne().sort('-year -month').lean(),
    Attendance.aggregate([{ $match: { date: { $gte: new Date(today.getTime() - 29 * 86400000) } } }, { $group: { _id: '$date', present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late', 'early_exit', 'work_from_home']] }, 1, 0] } }, absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } }, onLeave: { $sum: { $cond: [{ $eq: ['$status', 'on_leave'] }, 1, 0] } } } }, { $sort: { _id: 1 } }]),
    Employee.aggregate([{ $match: { ...empBase, isActive: true } }, { $group: { _id: '$department', count: { $sum: 1 } } }, { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } }, { $unwind: { path: '$d', preserveNullAndEmptyArrays: true } }, { $project: { name: { $ifNull: ['$d.name', 'Unassigned'] }, count: 1, _id: 0 } }, { $sort: { count: -1 } }, { $limit: 10 }]),
    (async () => {
      const emps = await Employee.find({ ...empBase, isActive: true, dateOfBirth: { $ne: null } }).select('firstName lastName employeeId dateOfBirth profilePhoto department').populate('department', 'name').lean();
      return emps.map((e) => { const d = new Date(e.dateOfBirth); const next = new Date(today.getFullYear(), d.getMonth(), d.getDate()); if (next < today) next.setFullYear(today.getFullYear() + 1); return { ...e, next, inDays: Math.round((next - today) / 86400000) }; }).filter((e) => e.inDays <= 45).sort((a, b) => a.inDays - b.inDays).slice(0, 8);
    })(),
    (async () => {
      const emps = await Employee.find({ ...empBase, isActive: true, joiningDate: { $ne: null } }).select('firstName lastName employeeId joiningDate profilePhoto department').populate('department', 'name').lean();
      return emps.map((e) => { const j = new Date(e.joiningDate); const next = new Date(today.getFullYear(), j.getMonth(), j.getDate()); if (next < today) next.setFullYear(today.getFullYear() + 1); return { ...e, next, inDays: Math.round((next - today) / 86400000), years: next.getFullYear() - j.getFullYear() }; }).filter((e) => e.inDays <= 45 && e.years > 0).sort((a, b) => a.inDays - b.inDays).slice(0, 8);
    })(),
    AuditLog.find().sort('-at').limit(12).select('actorName action module description at severity').lean(),
    Employee.countDocuments({ ...empBase, lastWorkingDay: { $gte: yearStart } }),
    LeaveRequest.countDocuments({ status: { $in: ['approved', 'hr_approved'] }, startDate: { $lte: today }, endDate: { $gte: today } }),
    Attendance.countDocuments({ 'corrections.status': 'pending' }),
  ]);

  const attById = todayAttendance.reduce((a, r) => ({ ...a, [r._id]: r }), {});
  const present = ['present', 'late', 'early_exit', 'work_from_home', 'od'].reduce((s, k) => s + (attById[k]?.count || 0), 0);
  const onLeave = attById.on_leave?.count || leaveToday || 0;
  const absent = attById.absent?.count || 0;
  const late = attById.late?.late || 0;
  const turnover = pct(exitsThisYear, Math.max(1, totalEmployees - newThisMonth));

  const payrollSummary = payrollLatest ? {
    period: payrollLatest.period, status: payrollLatest.status, net: payrollLatest.totalNet, gross: payrollLatest.totalGross, employees: payrollLatest.totalEmployees,
  } : null;

  return respond.ok(res, {
    employees: { total: totalEmployees, active: activeEmployees, inactive: inactiveEmployees, newThisMonth, onProbation, noticePeriod, onLeaveToday: onLeave, turnoverPercent: turnover, exitThisYear: exitsThisYear },
    attendance: { date: today, present, absent, late, onLeave, notMarked: Math.max(0, activeEmployees - present - absent - onLeave), avgHours: Math.round(((attById.present?.avgMinutes || 0) / 60) * 10) / 10, overtimeMinutes: attById.present?.otMinutes || 0, trend: attendanceTrend.map((t) => ({ date: t._id, present: t.present, absent: t.absent, onLeave: t.onLeave })) },
    leaves: { pendingApprovals: pendingLeaves, onLeaveToday: onLeave },
    organisation: { departments, designations, departmentHeadcount },
    recruitment: { openPositions, applicationsThisMonth, hiresThisYear },
    payroll: payrollSummary,
    celebration: { birthdays, anniversaries },
    recentActivities,
    pendingActions: { leaveApprovals: pendingLeaves, attendanceCorrections: pendingCorrections },
  });
}));

/* ── HR DASHBOARD ─────────────────────────────────────────────────── */
router.get('/hr', requirePermission('dashboard:view'), asyncHandler(async (req, res) => {
  const settings = await CompanySettings.findOne({ singleton: 'company' });
  const today = T.dateKey(new Date(), settings?.timezone);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const year = today.getFullYear();
  const [employeeStats, pendingLeave, pendingReimb, pipeline, onboardingProgress, leaveTrend, upcomingHolidays, expiringDocuments, probationEnding] = await Promise.all([
    Employee.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$employmentStatus', count: { $sum: 1 } } }]),
    LeaveRequest.find({ status: { $in: ['pending', 'manager_approved'] } }).populate('employee', 'firstName lastName employeeId profilePhoto').populate('leaveType', 'name color').sort('startDate').limit(8).lean(),
    Reimbursement.countDocuments({ status: 'pending' }),
    JobApplication.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
    Onboarding.find({ status: { $in: ['in_progress', 'awaiting_verification'] } }).populate('employee', 'firstName lastName employeeId joiningDate profilePhoto').sort('-createdAt').limit(8).lean(),
    LeaveRequest.aggregate([{ $match: { year, status: 'approved' } }, { $group: { _id: { m: { $month: '$startDate' } }, days: { $sum: '$totalDays' }, requests: { $sum: 1 } } }, { $sort: { '_id.m': 1 } }]),
    Holiday.find({ date: { $gte: today }, isActive: true }).sort('date').limit(6).lean(),
    Employee.aggregate([
      { $match: { deletedAt: null } }, { $unwind: '$documents' },
      { $match: { 'documents.expiryDate': { $gte: today, $lte: new Date(today.getTime() + 90 * 86400000) } } },
      { $project: { employeeId: 1, firstName: 1, lastName: 1, title: '$documents.title', expiryDate: '$documents.expiryDate' } },
      { $sort: { expiryDate: 1 } }, { $limit: 10 },
    ]),
    Employee.find({ deletedAt: null, employmentStatus: 'probation', probationEndDate: { $gte: today, $lte: new Date(today.getTime() + 60 * 86400000) } }).select('firstName lastName employeeId probationEndDate profilePhoto').sort('probationEndDate').limit(10).lean(),
  ]);
  return respond.ok(res, {
    employeeStats: employeeStats.reduce((a, s) => ({ ...a, [s._id]: s.count }), {}),
    pendingLeaves: pendingLeave, pendingReimbursements: pendingReimb,
    recruitmentPipeline: pipeline, onboardingProgress,
    leaveTrend: leaveTrend.map((l) => ({ month: T.MONTHS[l._id.m - 1], days: l.days, requests: l.requests })),
    upcomingHolidays, expiringDocuments, probationEnding, newJoineersThisMonth: await Employee.countDocuments({ deletedAt: null, joiningDate: { $gte: monthStart } }),
  });
}));

/* ── MANAGER DASHBOARD ────────────────────────────────────────────── */
router.get('/manager', requirePermission('dashboard:view'), asyncHandler(async (req, res) => {
  const managerId = req.scope.selfEmployeeId;
  if (!managerId) return res.status(400).json({ success: false, message: 'Your login is not linked to an employee record' });
  const settings = await CompanySettings.findOne({ singleton: 'company' });
  const today = T.dateKey(new Date(), settings?.timezone);
  const teamIds = await directReportIds(managerId);
  const allIds = [managerId, ...teamIds];
  const [team, attendanceToday, pendingLeaves, tasks, taskCompletion, teamPerformance, timesheetPending] = await Promise.all([
    Employee.find({ _id: { $in: allIds }, deletedAt: null }).select('firstName lastName employeeId profilePhoto designation employmentStatus').populate('designation', 'title').lean(),
    Attendance.aggregate([{ $match: { employee: { $in: allIds.map(oid) }, date: today } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    LeaveRequest.find({ employee: { $in: teamIds.map(oid) }, status: { $in: ['pending', 'manager_approved'] } }).populate('employee', 'firstName lastName employeeId profilePhoto').populate('leaveType', 'name color').sort('startDate').limit(10).lean(),
    Task.find({ assignees: { $in: allIds.map(oid) }, deletedAt: null }).populate('assignees', 'firstName lastName employeeId profileImage').sort('dueDate').limit(10).lean(),
    Task.aggregate([{ $match: { assignees: { $in: teamIds.map(oid) }, deletedAt: null } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Task.aggregate([{ $match: { assignees: { $in: teamIds.map(oid) }, deletedAt: null } }, { $unwind: '$assignees' }, { $match: { assignees: { $in: teamIds.map(oid) } } }, { $group: { _id: '$assignees', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, overdue: { $sum: { $cond: [{ $and: [{ $lt: ['$dueDate', new Date()] }, { $ne: ['$status', 'completed'] }] }, 1, 0] } } } }, { $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'e' } }, { $unwind: '$e' }, { $project: { name: { $concat: ['$e.firstName', ' ', '$e.lastName'] }, employeeId: '$e.employeeId', photo: '$e.profilePhoto', total: 1, completed: 1, overdue: 1, rate: { $cond: [{ $gt: ['$total', 0] }, { $round: [{ $multiply: [{ $divide: ['$completed', '$total'] }, 100] }, 0] }, 0] }, _id: 0 } }, { $sort: { rate: -1 } }]),
    Timesheet.countDocuments({ employee: { $in: teamIds }, status: 'submitted' }),
  ]);
  const att = attendanceToday.reduce((a, r) => ({ ...a, [r._id]: r.count }), {});
  const totalTasks = taskCompletion.reduce((s, t) => s + t.count, 0);
  const completed = taskCompletion.find((t) => t._id === 'completed')?.count || 0;
  return respond.ok(res, {
    team: { size: team.length, members: team },
    attendance: { date: today, present: (att.present || 0) + (att.late || 0) + (att.work_from_home || 0) + (att.early_exit || 0), absent: att.absent || 0, onLeave: att.on_leave || 0, late: att.late || 0, notMarked: Math.max(0, team.length - Object.values(att).reduce((a, b) => a + b, 0)) },
    pendingApprovals: { leaves: pendingLeaves.length, timesheets: timesheetPending },
    approvals: pendingLeaves,
    tasks: tasks.map((t) => ({ ...t, isOverdue: !!(t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed') })),
    taskStats: { byStatus: taskCompletion.map((t) => ({ status: t._id, count: t.count })), total: totalTasks, completed, completionPercent: pct(completed, totalTasks) },
    teamPerformance,
  });
}));

/* ── EMPLOYEE DASHBOARD ───────────────────────────────────────────── */
router.get('/employee', requirePermission('dashboard:view'), asyncHandler(async (req, res) => {
  let employee = await Employee.findById(req.scope.selfEmployeeId)
    .populate('department', 'name').populate('designation', 'title').populate('reportingManager', 'firstName lastName employeeId profilePhoto')
    .populate('shift', 'name startTime endTime');
  if (!employee && req.user.role !== 'employee') {
    return respond.ok(res, { isPrivileged: true, message: 'Your account has no employee profile. Use the admin dashboard for company-wide analytics.', role: req.user.role });
  }
  if (!employee) return res.status(404).json({ success: false, message: 'Employee profile not found for your account' });

  const settings = await CompanySettings.findOne({ singleton: 'company' });
  const today = T.dateKey(new Date(), settings?.timezone);
  const year = new Date().getFullYear();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [todayAttendance, balances, pendingLeaves, myLeaves, tasks, upcomingTasks, latestPayslip, holidayList, announcements, notifications, assets, training, attendanceSummary, myProjects] = await Promise.all([
    Attendance.findOne({ employee: employee._id, date: today }).lean(),
    LeaveBalance.find({ employee: employee._id, year }).populate('leaveType', 'name code color').lean({ virtuals: true }),
    LeaveRequest.countDocuments({ employee: employee._id, status: { $in: ['pending', 'manager_approved'] } }),
    LeaveRequest.find({ employee: employee._id }).populate('leaveType', 'name color').sort('-appliedAt').limit(5).lean(),
    Task.aggregate([{ $match: { assignees: employee._id, deletedAt: null } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Task.find({ assignees: employee._id, status: { $nin: ['completed'] }, deletedAt: null }).populate('project', 'name code').sort('dueDate').limit(6).lean(),
    Payslip.findOne({ employee: employee._id }).sort('-year -month').lean(),
    Holiday.find({ date: { $gte: today }, isActive: true }).sort('date').limit(5).lean(),
    Announcement.find({ status: 'published', publishAt: { $lte: new Date() }, deletedAt: null, 'audience.type': { $in: ['all', null] } }).sort('-pinned -publishAt').limit(5).select('title summary category publishAt').lean(),
    Notification.find({ user: req.user._id }).sort('-createdAt').limit(8).lean(),
    require('../models').AssetAssignment.find({ employee: employee._id, status: 'assigned' }).populate('asset', 'assetId name category').lean(),
    TrainingAssignment.find({ employee: employee._id, status: { $in: ['assigned', 'in_progress'] } }).populate('program', 'title category startDate durationHours').limit(5).lean(),
    Attendance.aggregate([{ $match: { employee: employee._id, date: { $gte: monthStart, $lte: today } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Project.find({ 'team.employee': employee._id, deletedAt: null }).select('name code status').limit(5).lean(),
  ]);

  const taskById = tasks.reduce((a, t) => ({ ...a, [t._id]: t.count }), {});
  const leaveBalance = balances.map((b) => ({ name: b.leaveType?.name, code: b.leaveType?.code, color: b.leaveType?.color, available: b.available, allocated: b.allocated, used: b.used, pending: b.pending }));

  return respond.ok(res, {
    employee: {
      _id: employee._id, employeeId: employee.employeeId, name: employee.fullName, profilePhoto: employee.profilePhoto,
      department: employee.department?.name, designation: employee.designation?.title, joiningDate: employee.joiningDate,
      employmentStatus: employee.employmentStatus, workLocation: employee.workLocation,
      reportingManager: employee.reportingManager ? { name: `${employee.reportingManager.firstName} ${employee.reportingManager.lastName}`, profilePhoto: employee.reportingManager.profilePhoto } : null,
      shift: employee.shift, email: employee.email, phone: employee.phone,
    },
    attendance: {
      today: todayAttendance,
      live: todayAttendance?.checkIn && !todayAttendance?.checkOut ? { since: todayAttendance.checkIn, minutes: T.minutesBetween(todayAttendance.checkIn, new Date()) - (todayAttendance.breakMinutes || 0) } : null,
      monthSummary: attendanceSummary.reduce((a, s) => ({ ...a, [s._id]: s.count }), {}),
      workingDays: settings?.workingDays || [1, 2, 3, 4, 5],
    },
    leave: { balances: leaveBalance, pendingRequests: pendingLeaves, recentRequests: myLeaves },
    tasks: { byStatus: tasks.map((t) => ({ status: t._id, count: t.count })), upcoming: upcomingTasks.map((t) => ({ ...t, isOverdue: !!(t.dueDate && new Date(t.dueDate) < new Date()) })), total: Object.values(taskById).reduce((a, b) => a + b, 0) },
    latestPayslip, upcomingHolidays: holidayList, announcements, notifications, assets, training, projects: myProjects,
  });
}));

/* ── SHARED WIDGETS ───────────────────────────────────────────────── */
router.get('/widgets/celebrations', requirePermission('dashboard:view'), asyncHandler(async (req, res) => {
  const { birthdays, anniversaries } = await (async () => {
    const employees = await Employee.find({ deletedAt: null, isActive: true }).select('firstName lastName employeeId profilePhoto dateOfBirth joiningDate department designation').populate('department designation', 'name title').lean();
    const today = new Date();
    const b = [], a = [];
    employees.forEach((e) => {
      if (e.dateOfBirth) { const d = new Date(e.dateOfBirth); const n = new Date(today.getFullYear(), d.getMonth(), d.getDate()); if (n < today) n.setFullYear(today.getFullYear() + 1); const inDays = Math.round((n - today) / 86400000); if (inDays <= 45) b.push({ ...e, date: n, inDays, type: 'birthday' }); }
      if (e.joiningDate) { const d = new Date(e.joiningDate); const n = new Date(today.getFullYear(), d.getMonth(), d.getDate()); if (n < today) n.setFullYear(today.getFullYear() + 1); const inDays = Math.round((n - today) / 86400000); const years = n.getFullYear() - d.getFullYear(); if (inDays <= 45 && years > 0) a.push({ ...e, date: n, inDays, years, type: 'anniversary' }); }
    });
    return { birthdays: b.sort((x, y) => x.inDays - y.inDays).slice(0, 20), anniversaries: a.sort((x, y) => x.inDays - y.inDays).slice(0, 20) };
  })();
  return respond.ok(res, { birthdays, anniversaries });
}));

router.get('/widgets/quick-stats', requirePermission('dashboard:view'), asyncHandler(async (req, res) => {
  const year = new Date().getFullYear();
  const [headcount, openTasks, pendingLeaves, unreadNotifications] = await Promise.all([
    Employee.countDocuments({ deletedAt: null, isActive: true }),
    Task.countDocuments({ assignees: req.scope.selfEmployeeId, status: { $nin: ['completed'] }, deletedAt: null }),
    LeaveRequest.countDocuments({ status: 'pending' }),
    Notification.countDocuments({ user: req.user._id, isRead: false }),
  ]);
  void year;
  return respond.ok(res, { headcount, myOpenTasks: openTasks, pendingLeaves, unreadNotifications });
}));

module.exports = router;
