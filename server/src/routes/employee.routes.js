'use strict';
const express = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const { Employee, User, Department, Designation, Attendance, LeaveRequest, LeaveBalance, Onboarding, Document: _D, Asset, AssetAssignment, CompanySettings } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const validate = require('../middleware/validate');
const { requirePermission, assertCanActOnEmployee, directReportIds } = require('../middleware/auth');
const { buildQuery, paginate, escapeRegex } = require('../utils/query');
const { recordAudit } = require('../utils/audit');
const { sendCSV, parseCSV } = require('../utils/csv');
const { nextCode } = require('../utils/sequence');
const { fileUploader, persistFile } = require('../utils/upload');
const { sendMail, layout } = require('../utils/mailer');
const { notify } = require('../utils/notify');

const router = express.Router();

const POPULATE = [
  { path: 'department', select: 'name code' },
  { path: 'designation', select: 'title jobLevel' },
  { path: 'reportingManager', select: 'firstName lastName employeeId' },
  { path: 'teamLeader', select: 'firstName lastName employeeId' },
  { path: 'shift', select: 'name startTime endTime' },
];

const employeeBody = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  workEmail: z.string().email().optional().or(z.literal('')),
  phone: z.string().min(6).max(20).optional().or(z.literal('')),
  workPhone: z.string().optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed', 'other']).optional(),
  bloodGroup: z.string().optional(),
  address: z.object({ line1: z.string().optional(), line2: z.string().optional(), city: z.string().optional(), state: z.string().optional(), country: z.string().optional(), pincode: z.string().optional() }).optional(),
  permanentAddress: z.object({ line1: z.string().optional(), line2: z.string().optional(), city: z.string().optional(), state: z.string().optional(), country: z.string().optional(), pincode: z.string().optional() }).optional(),
  emergencyContact: z.object({ name: z.string().optional(), relationship: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), address: z.string().optional() }).optional(),
  joiningDate: z.coerce.date(),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern', 'consultant']).optional(),
  employmentStatus: z.enum(['active', 'probation', 'notice_period', 'resigned', 'terminated', 'retired', 'inactive']).optional(),
  employeeCategory: z.enum(['permanent', 'probationer', 'contractual', 'intern', 'consultant', 'trainee']).optional(),
  department: z.string().min(1, 'Department is required'),
  designation: z.string().min(1, 'Designation is required'),
  reportingManager: z.string().optional().nullable().or(z.literal('')),
  teamLeader: z.string().optional().nullable().or(z.literal('')),
  workLocation: z.string().optional(),
  shift: z.string().optional().nullable().or(z.literal('')),
  probationEndDate: z.coerce.date().optional(),
  confirmationDate: z.coerce.date().optional(),
  noticePeriodDays: z.coerce.number().min(0).max(365).optional(),
  skills: z.array(z.object({ name: z.string(), level: z.string().optional(), years: z.coerce.number().optional() })).optional(),
  qualifications: z.array(z.object({ degree: z.string().optional(), specialization: z.string().optional(), institution: z.string().optional(), year: z.coerce.number().optional(), grade: z.string().optional() })).optional(),
  experience: z.array(z.object({ company: z.string().optional(), title: z.string().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), current: z.boolean().optional(), description: z.string().optional() })).optional(),
  bank: z.object({
    accountHolderName: z.string().optional(), accountNumber: z.string().optional(), ifsc: z.string().optional(),
    bankName: z.string().optional(), branch: z.string().optional(), accountType: z.string().optional(), upiId: z.string().optional(),
  }).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  createLogin: z.boolean().optional(),
  role: z.enum(['super_admin', 'hr_admin', 'hr_manager', 'department_manager', 'team_leader', 'employee']).optional(),
  sendWelcomeEmail: z.boolean().optional(),
  onboardingTemplate: z.string().optional(),
}).passthrough();

const mask = (acc) => (acc ? `XXXXXX${String(acc).slice(-4)}` : undefined);

/* ── LIST (scope-aware) ───────────────────────────────────────────── */
router.get('/', requirePermission('employees:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, {
    searchFields: ['firstName', 'lastName', 'email', 'employeeId', 'workEmail', 'tags', 'skills.name'],
    filterFields: ['department', 'designation', 'employmentStatus', 'employmentType', 'employeeCategory', 'workLocation', 'reportingManager', 'gender', 'isActive', 'tags'],
    defaultSort: 'firstName',
  });
  opts.filter.deletedAt = null;
  if (req.query.dateField === 'joiningDate' || req.query.from || req.query.to) {
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    const range = {};
    if (from) range.$gte = from;
    if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); range.$lte = d; }
    if (Object.keys(range).length) opts.filter.joiningDate = range;
  }
  if (req.query.reportingManager === 'me' && req.scope.selfEmployeeId) opts.filter.reportingManager = req.scope.selfEmployeeId;
  if (req.query.includeInactive !== 'true') opts.filter.employmentStatus = opts.filter.employmentStatus || { $nin: ['terminated', 'retired'] };

  const { items, meta } = await paginate(Employee, opts, { populate: POPULATE });
  const sanitized = items.map((e) => {
    const clean = { ...e };
    delete clean.bank; delete clean.notes;
    return clean;
  });
  if (req.query.export === 'csv') {
    return sendCSV(res, `employees-${Date.now()}.csv`, sanitized, [
      { key: 'employeeId', label: 'Employee ID' }, { key: 'firstName', label: 'First Name' },
      { key: 'lastName', label: 'Last Name' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
      { key: 'department.name', label: 'Department' }, { key: 'designation.title', label: 'Designation' },
      { key: 'employmentType', label: 'Employment Type' }, { key: 'employmentStatus', label: 'Status' },
      { key: 'joiningDate', label: 'Joining Date', value: (r) => (r.joiningDate ? new Date(r.joiningDate).toISOString().slice(0, 10) : '') },
      { key: 'workLocation', label: 'Work Location' },
    ]);
  }
  return respond.list(res, sanitized, meta);
}));

/* ── DIRECTORY (lightweight, all authenticated users) ─────────────── */
router.get('/directory', asyncHandler(async (req, res) => {
  const filter = { deletedAt: null, employmentStatus: { $nin: ['terminated', 'resigned', 'retired'] } };
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i');
    filter.$or = [{ firstName: rx }, { lastName: rx }, { employeeId: rx }, { workEmail: rx }];
  }
  if (req.query.department) filter.department = req.query.department;
  const items = await Employee.find(filter)
    .select('firstName lastName employeeId profilePhoto department designation workLocation workEmail phone')
    .populate('department designation', 'name code title')
    .sort('firstName').limit(Math.min(300, parseInt(req.query.limit, 10) || 200)).lean();
  return respond.list(res, items, { total: items.length });
}));

/* ── STATISTICS ───────────────────────────────────────────────────── */
router.get('/stats/summary', requirePermission('employees:view'), asyncHandler(async (req, res) => {
  const base = { deletedAt: null };
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const [total, active, probation, onNotice, exited, newThisMonth, newThisYear, byDepartment, byType, byGender, joiningTrend] = await Promise.all([
    Employee.countDocuments(base),
    Employee.countDocuments({ ...base, employmentStatus: { $in: ['active', 'probation', 'notice_period'] } }),
    Employee.countDocuments({ ...base, employmentStatus: 'probation' }),
    Employee.countDocuments({ ...base, employmentStatus: 'notice_period' }),
    Employee.countDocuments({ ...base, employmentStatus: { $in: ['resigned', 'terminated', 'retired'] } }),
    Employee.countDocuments({ ...base, joiningDate: { $gte: monthStart } }),
    Employee.countDocuments({ ...base, joiningDate: { $gte: yearStart } }),
    Employee.aggregate([{ $match: base }, { $group: { _id: '$department', count: { $sum: 1 } } }, { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } }, { $unwind: { path: '$d', preserveNullAndEmptyArrays: true } }, { $project: { department: '$d.name', count: 1, _id: 0 } }, { $sort: { count: -1 } }]),
    Employee.aggregate([{ $match: base }, { $group: { _id: '$employmentType', count: { $sum: 1 } } }]),
    Employee.aggregate([{ $match: base }, { $group: { _id: '$gender', count: { $sum: 1 } } }]),
    Employee.aggregate([
      { $match: { ...base, joiningDate: { $gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) } } },
      { $group: { _id: { y: { $year: '$joiningDate' }, m: { $month: '$joiningDate' } }, count: { $sum: 1 } } },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
  ]);
  const turnover = total ? Math.round((exited / total) * 1000) / 10 : 0;
  return respond.ok(res, {
    total, active, probation, onNotice, exited, inactive: total - active,
    newThisMonth, newThisYear, turnoverPercent: turnover,
    byDepartment, byEmploymentType: byType, byGender, joiningTrend,
  });
}));

/* ── BIRTHDAYS / ANNIVERSARIES ────────────────────────────────────── */
router.get('/celebrations/upcoming', asyncHandler(async (req, res) => {
  const today = new Date();
  const employees = await Employee.find({ deletedAt: null, isActive: true, employmentStatus: { $nin: ['terminated', 'retired'] } })
    .select('firstName lastName employeeId profilePhoto dateOfBirth joiningDate department designation')
    .populate('department designation', 'name title').lean();
  const daysAhead = Math.min(90, parseInt(req.query.days, 10) || 30);
  const within = (d) => {
    const next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
    if (next < new Date(today.getFullYear(), today.getMonth(), today.getDate())) next.setFullYear(today.getFullYear() + 1);
    const diff = Math.round((next - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
    return { next, diff };
  };
  const birthdays = [], anniversaries = [];
  employees.forEach((e) => {
    if (e.dateOfBirth) { const { next, diff } = within(new Date(e.dateOfBirth)); if (diff <= daysAhead) birthdays.push({ ...e, date: next, inDays: diff, turning: next.getFullYear() - new Date(e.dateOfBirth).getFullYear() }); }
    if (e.joiningDate) { const { next, diff } = within(new Date(e.joiningDate)); if (diff <= daysAhead) anniversaries.push({ ...e, date: next, inDays: diff, years: next.getFullYear() - new Date(e.joiningDate).getFullYear() }); }
  });
  birthdays.sort((a, b) => a.inDays - b.inDays); anniversaries.sort((a, b) => a.inDays - b.inDays);
  return respond.ok(res, { birthdays: birthdays.slice(0, 50), anniversaries: anniversaries.slice(0, 50) });
}));

/* ── CSV IMPORT TEMPLATE + IMPORT ─────────────────────────────────── */
router.get('/import/template', requirePermission('employees:create'), (req, res) => {
  const sample = [{
    firstName: 'Riya', lastName: 'Patel', email: 'riya.patel@acme.com', phone: '+91 98250 11223',
    gender: 'female', dateOfBirth: '1996-04-12', joiningDate: '2026-01-15', department: 'Engineering',
    designation: 'Software Engineer', employmentType: 'full_time', employmentStatus: 'probation',
    workLocation: 'Ahmedabad HQ', reportingManagerEmail: 'manager@acme.com', basicSalary: '45000', ctcAnnual: '780000',
  }];
  sendCSV(res, 'employee-import-template.csv', sample);
});

router.post('/import', requirePermission('employees:create'), fileUploader({ types: ['text/csv', 'application/vnd.ms-excel', 'text/plain'], maxSizeMB: 5 }), asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Please upload a CSV file (field name: file)');
  const fs = require('fs');
  const rows = parseCSV(fs.readFileSync(req.file.path, 'utf8'));
  if (!rows.length) throw ApiError.badRequest('CSV file contains no data rows');
  if (rows.length > 1000) throw ApiError.badRequest('Please import at most 1000 rows at a time');

  const settings = await CompanySettings.findOne({ singleton: 'company' });
  const depts = await Department.find({ deletedAt: null }).select('name code').lean();
  const desigs = await Designation.find({ deletedAt: null }).select('title department').lean();
  const results = { created: 0, failed: 0, errors: [], preview: rows.slice(0, 5) };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const dept = depts.find((d) => d.name.toLowerCase() === String(r.department || '').toLowerCase() || d.code === String(r.department || '').toUpperCase());
      const desig = desigs.find((d) => d.title.toLowerCase() === String(r.designation || '').toLowerCase() && (!dept || String(d.department) === String(dept._id)));
      if (!dept) throw new Error(`Department "${r.department}" not found`);
      if (!desig) throw new Error(`Designation "${r.designation}" not found for that department`);
      if (!r.firstName || !r.lastName || !r.email || !r.joiningDate) throw new Error('firstName, lastName, email and joiningDate are required');
      const dup = await Employee.findOne({ email: String(r.email).toLowerCase(), deletedAt: null });
      if (dup) throw new Error(`Employee with email ${r.email} already exists`);

      const employeeId = r.employeeId || await nextCode(settings?.employeeIdPattern || 'EMP{YYYY}{SEQ:4}', { prefix: 'EMP' });
      let manager = null;
      if (r.reportingManagerEmail) {
        manager = await Employee.findOne({ email: String(r.reportingManagerEmail).toLowerCase(), deletedAt: null }).select('_id');
      }
      const employee = await Employee.create({
        employeeId,
        firstName: r.firstName, lastName: r.lastName,
        email: String(r.email).toLowerCase(), phone: r.phone || undefined,
        gender: r.gender || 'prefer_not_to_say',
        dateOfBirth: r.dateOfBirth ? new Date(r.dateOfBirth) : undefined,
        joiningDate: new Date(r.joiningDate),
        department: dept._id, designation: desig._id,
        employmentType: r.employmentType || 'full_time',
        employmentStatus: r.employmentStatus || 'probation',
        workLocation: r.workLocation || 'Ahmedabad HQ',
        reportingManager: manager?._id || null,
        createdBy: req.user._id,
        history: [{ by: req.user._id, action: 'created_via_import', note: `Imported from ${req.file.originalname}` }],
      });
      results.created++;
      if (req.query.previewOnly === 'true') {
        results.created--; results.preview.push({ employeeId: employee.employeeId, name: `${r.firstName} ${r.lastName}` });
        await Employee.findByIdAndDelete(employee._id);
      }
    } catch (e) {
      results.failed++;
      if (results.errors.length < 100) results.errors.push({ row: i + 2, email: r.email, message: e.message });
    }
  }
  fs.unlink(req.file.path, () => {});
  await recordAudit(req, { action: 'employee.import', module: 'employees', description: `Imported employees from CSV: ${results.created} created, ${results.failed} failed`, severity: 'warning' });
  return respond.ok(res, results, `${results.created} employee(s) imported, ${results.failed} failed`);
}));

/* ── GET ONE ──────────────────────────────────────────────────────── */
router.get('/:id', requirePermission('employees:view'), asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw ApiError.badRequest('Invalid employee id');
  const emp = await Employee.findById(req.params.id).populate(POPULATE);
  if (!emp || emp.deletedAt) throw ApiError.notFound('Employee not found');
  const isSelf = String(req.scope.selfEmployeeId || '') === String(emp._id);
  if (!req.scope.isGlobal && !isSelf) await assertCanActOnEmployee(req, emp._id);
  if (!req.scope.isGlobal && !isSelf) {
    // managers viewing a reportee get a trimmed view (no bank/notes/salary)
    const obj = emp.toObject({ virtuals: true });
    delete obj.bank; obj.notes = [];
    return respond.ok(res, obj);
  }
  return respond.ok(res, emp.sanitizeFor(req.user));
}));

router.get('/:id/reportees', requirePermission('employees:view'), asyncHandler(async (req, res) => {
  const ids = await directReportIds(req.params.id, 0);
  const [direct, all] = await Promise.all([
    Employee.find({ reportingManager: req.params.id, deletedAt: null }).select('firstName lastName employeeId profilePhoto designation employmentStatus').populate('designation', 'title').lean(),
    Employee.find({ _id: { $in: ids } }).select('firstName lastName employeeId designation employmentStatus').populate('designation', 'title').lean(),
  ]);
  return respond.ok(res, { direct, totalReporting: all.length });
}));

router.get('/:id/overview', requirePermission('employees:view'), asyncHandler(async (req, res) => {
  const id = req.params.id;
  const year = new Date().getFullYear();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [attendanceThisMonth, leaveBalances, pendingLeaves, assets] = await Promise.all([
    Attendance.aggregate([
      { $match: { employee: new mongoose.Types.ObjectId(id), date: { $gte: monthStart } } },
      { $group: { _id: '$status', count: { $sum: 1 }, minutes: { $sum: '$workedMinutes' } } },
    ]),
    LeaveBalance.find({ employee: id, year }).populate('leaveType', 'name code color').lean({ virtuals: true }),
    LeaveRequest.countDocuments({ employee: id, status: 'pending' }),
    AssetAssignment.find({ employee: id, status: 'assigned' }).populate('asset', 'assetId name category status').lean(),
  ]);
  return respond.ok(res, { attendanceThisMonth, leaveBalances, pendingLeaves, assets });
}));

/* ── CREATE ───────────────────────────────────────────────────────── */
router.post('/', requirePermission('employees:create'), validate({ body: employeeBody }), asyncHandler(async (req, res) => {
  const body = { ...req.body };
  delete body.createLogin; delete body.role; delete body.sendWelcomeEmail; delete body.onboardingTemplate;

  const dupEmail = await Employee.findOne({ email: body.email.toLowerCase(), deletedAt: null });
  if (dupEmail) throw ApiError.conflict(`An employee with email ${body.email} already exists`);

  const dept = await Department.findOne({ _id: body.department, deletedAt: null });
  if (!dept) throw ApiError.badRequest('Selected department does not exist');
  const desig = await Designation.findOne({ _id: body.designation, deletedAt: null });
  if (!desig) throw ApiError.badRequest('Selected designation does not exist');

  const settings = await CompanySettings.findOne({ singleton: 'company' });
  body.employeeId = req.body.employeeId || await nextCode(settings?.employeeIdPattern || 'EMP{YYYY}{SEQ:4}', { prefix: 'EMP' });
  ['reportingManager', 'teamLeader', 'shift'].forEach((k) => { if (!body[k]) body[k] = null; });

  if (body.bank?.accountNumber) {
    body.bank.maskedAccountNumber = mask(body.bank.accountNumber);
  }
  const employee = new Employee({ ...body, createdBy: req.user._id });
  employee.history.push({ by: req.user._id, action: 'created', note: 'Employee record created' });
  await employee.save();

  let login = null;
  if (req.body.createLogin !== false) {
    const existing = await User.findOne({ email: employee.email });
    if (!existing) {
      const tempPassword = req.body.tempPassword || `Ems@${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 90 + 10)}`;
      login = await User.create({
        name: `${employee.firstName} ${employee.lastName}`,
        email: employee.email,
        password: req.body.password || tempPassword,
        role: req.body.role || 'employee',
        employee: employee._id,
      });
      employee.user = login._id;
      await employee.save();
      if (req.body.sendWelcomeEmail !== false) {
        await sendMail({
          to: employee.email, subject: 'Welcome to the team — your EMS account',
          html: layout('Welcome aboard!', `<p>Hi ${employee.firstName},</p><p>Your employee account (<b>${employee.employeeId}</b>) has been created.</p><p>Sign in at <a href="${require('../config/env').CLIENT_ORIGIN}">${require('../config/env').CLIENT_ORIGIN}</a> with your work email.</p><p>Your temporary password: <b>${tempPassword}</b></p><p>Please change it after your first sign-in.</p>`),
        });
      }
      login = { email: login.email, role: login.role, temporaryPassword: req.body.password ? undefined : tempPassword };
    }
  }

  if (req.body.onboardingTemplate) {
    const { OnboardingTemplate } = require('../models');
    const tpl = await OnboardingTemplate.findById(req.body.onboardingTemplate);
    if (tpl) {
      await Onboarding.create({
        employee: employee._id, template: tpl._id, status: 'in_progress', startDate: employee.joiningDate,
        targetCompletionDate: new Date(new Date(employee.joiningDate).getTime() + 30 * 86400000),
        tasks: (tpl.tasks || []).map((t, i) => ({ ...t, dueDate: new Date(new Date(employee.joiningDate).getTime() + (t.dueAfterDays || 1) * 86400000), order: t.order ?? i })),
        documents: (tpl.documentsRequired || []).map((d) => ({ title: d.title, category: d.category, status: 'pending' })),
        hrOwner: req.user._id, managerOwner: employee.reportingManager,
      });
    }
  }

  await recordAudit(req, { action: 'employee.create', module: 'employees', targetModel: 'Employee', targetId: employee._id, description: `Created employee ${employee.fullName} (${employee.employeeId})` });
  await notify({ userId: employee.user, title: 'Welcome to the company 🎉', body: `Your employee profile (${employee.employeeId}) has been created.`, type: 'system', link: '/profile' });
  if (employee.reportingManager) {
    const mgr = await Employee.findById(employee.reportingManager).select('user').lean();
    await notify({ userId: mgr?.user, title: 'New team member', body: `${employee.fullName} joins your team as ${desig.title}.`, type: 'system', link: `/employees/${employee._id}` });
  }
  return respond.created(res, { employee: employee.toObject({ virtuals: true }), login }, 'Employee added successfully');
}));

/* ── UPDATE ───────────────────────────────────────────────────────── */
/**
 * employees:update ધરાવતા રોલ માટે પૂરો પ્રવેશ; બીજા કર્મચારી પોતાની જ પ્રોફાઇલ
 * (પરવાનગીવાળા ફીલ્ડ — ફોન, સરનામું, બેંક, આપત્કાલીન સંપર્ક વગેરે) બદલી શકે.
 */
const canUpdateEmployee = (req, res, next) => {
  const perms = req.user.__perms || [];
  const hasUpdate = perms.includes('*') || perms.includes('employees:update');
  const linkedId = req.user.employee?._id || req.user.employee;
  const isSelf = linkedId && String(linkedId) === String(req.params.id);
  if (hasUpdate || isSelf) return next();
  return next(ApiError.forbidden('Missing permission: employees:update'));
};

router.patch('/:id', canUpdateEmployee, asyncHandler(async (req, res) => {
  const emp = await Employee.findById(req.params.id);
  if (!emp || emp.deletedAt) throw ApiError.notFound('Employee not found');
  const before = emp.toObject();
  const body = { ...req.body };
  delete body.employeeId; delete body._id; delete body.user; delete body.history;
  if (!req.scope.isGlobal) {
    const isSelf = String(req.scope.selfEmployeeId) === String(emp._id);
    if (isSelf) {
      // employees may only touch permitted self-service fields
      const allowed = ['phone', 'address', 'permanentAddress', 'emergencyContact', 'maritalStatus', 'bloodGroup', 'bank', 'profilePhoto', 'skills', 'qualifications', 'experience'];
      Object.keys(body).forEach((k) => { if (!allowed.includes(k)) delete body[k]; });
    } else {
      await assertCanActOnEmployee(req, emp._id);
      const allowed = ['workLocation', 'shift', 'teamLeader', 'tags'];
      Object.keys(body).forEach((k) => { if (!allowed.includes(k)) delete body[k]; });
    }
  }
  if (body.bank?.accountNumber) body.bank.maskedAccountNumber = mask(body.bank.accountNumber);
  if (body.email && body.email.toLowerCase() !== emp.email) {
    const dup = await Employee.findOne({ email: body.email.toLowerCase(), deletedAt: null, _id: { $ne: emp._id } });
    if (dup) throw ApiError.conflict('Another employee already uses this email');
  }
  Object.assign(emp, body);
  const changed = Object.keys(body).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(emp.toObject()[k]));
  if (changed.length) emp.history.push({ by: req.user._id, action: 'updated', changes: changed.reduce((acc, k) => ({ ...acc, [k]: { from: before[k], to: emp.toObject()[k] } }), {}), note: req.body.note || 'Profile updated' });
  emp.updatedBy = req.user._id;
  await emp.save();
  await recordAudit(req, { action: 'employee.update', module: 'employees', targetModel: 'Employee', targetId: emp._id, description: `Updated employee ${emp.fullName}`, metadata: { fields: changed } });
  return respond.ok(res, emp, 'Employee updated successfully');
}));

/* ── STATUS ACTIONS ───────────────────────────────────────────────── */
router.post('/:id/deactivate', requirePermission('employees:update'), asyncHandler(async (req, res) => {
  const emp = await Employee.findById(req.params.id);
  if (!emp) throw ApiError.notFound('Employee not found');
  emp.isActive = false;
  emp.employmentStatus = req.body.status || 'inactive';
  emp.history.push({ by: req.user._id, action: 'deactivated', note: req.body.reason || 'Account deactivated' });
  await emp.save();
  if (emp.user) await User.findByIdAndUpdate(emp.user, { isActive: false });
  await recordAudit(req, { action: 'employee.deactivate', module: 'employees', targetId: emp._id, description: `Deactivated ${emp.fullName}`, severity: 'warning' });
  return respond.ok(res, emp, 'Employee deactivated');
}));

router.post('/:id/reactivate', requirePermission('employees:update'), asyncHandler(async (req, res) => {
  const emp = await Employee.findById(req.params.id);
  if (!emp) throw ApiError.notFound('Employee not found');
  emp.isActive = true;
  emp.employmentStatus = req.body.status || 'active';
  emp.history.push({ by: req.user._id, action: 'reactivated', note: req.body.reason || 'Reactivated' });
  await emp.save();
  if (emp.user) await User.findByIdAndUpdate(emp.user, { isActive: true });
  await recordAudit(req, { action: 'employee.reactivate', module: 'employees', targetId: emp._id, description: `Reactivated ${emp.fullName}` });
  return respond.ok(res, emp, 'Employee reactivated');
}));

/* ── ARCHIVE (soft delete) ────────────────────────────────────────── */
router.delete('/:id', requirePermission('employees:delete'), asyncHandler(async (req, res) => {
  const emp = await Employee.findById(req.params.id);
  if (!emp || emp.deletedAt) throw ApiError.notFound('Employee not found');
  emp.deletedAt = new Date(); emp.deletedBy = req.user._id; emp.isActive = false;
  emp.history.push({ by: req.user._id, action: 'archived', note: req.body?.reason || 'Record archived (history preserved)' });
  await emp.save();
  if (emp.user) await User.findByIdAndUpdate(emp.user, { isActive: false });
  await recordAudit(req, { action: 'employee.archive', module: 'employees', targetId: emp._id, description: `Archived ${emp.fullName} (soft delete — payroll/attendance history retained)`, severity: 'critical' });
  return respond.ok(res, { _id: emp._id }, 'Employee archived. Historical records preserved.');
}));

router.post('/:id/restore', requirePermission('employees:delete'), asyncHandler(async (req, res) => {
  const emp = await Employee.findByIdAndUpdate(req.params.id, { deletedAt: null, deletedBy: null, isActive: true }, { new: true });
  if (!emp) throw ApiError.notFound('Employee not found');
  await recordAudit(req, { action: 'employee.restore', module: 'employees', targetId: emp._id, description: `Restored ${emp.fullName}` });
  return respond.ok(res, emp, 'Employee record restored');
}));

/* ── PHOTO ────────────────────────────────────────────────────────── */
router.post('/:id/photo', requirePermission('employees:update'), fileUploader({ types: ['image/jpeg', 'image/png', 'image/webp'], field: 'photo' }), asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Please choose a photo (jpeg/png/webp, max 5 MB)');
  const meta = await persistFile(req.file);
  const emp = await Employee.findByIdAndUpdate(req.params.id, { profilePhoto: meta.url }, { new: true });
  if (!emp) throw ApiError.notFound('Employee not found');
  if (emp.user) await User.findByIdAndUpdate(emp.user, {});
  await recordAudit(req, { action: 'employee.photo_upload', module: 'employees', targetId: emp._id, description: `Updated profile photo for ${emp.fullName}` });
  return respond.ok(res, { profilePhoto: meta.url }, 'Profile photo updated');
}));

/* ── DOCUMENTS ────────────────────────────────────────────────────── */
router.post('/:id/documents', requirePermission('employees:update', 'documents:create'), fileUploader({ types: require('../utils/upload').ALLOWED.doc.concat(['image/jpeg', 'image/png']), maxSizeMB: 10 }), asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Please attach a file');
  const emp = await Employee.findById(req.params.id);
  if (!emp) throw ApiError.notFound('Employee not found');
  const meta = await persistFile(req.file);
  emp.documents.push({
    title: req.body.title || req.file.originalname, category: req.body.category || 'other',
    file: meta, expiryDate: req.body.expiryDate ? new Date(req.body.expiryDate) : undefined,
    issuedDate: req.body.issuedDate ? new Date(req.body.issuedDate) : undefined, remarks: req.body.remarks,
    uploadedBy: req.user._id,
  });
  emp.history.push({ by: req.user._id, action: 'document_uploaded', note: req.file.originalname });
  await emp.save();
  await recordAudit(req, { action: 'document.upload', module: 'documents', targetModel: 'Employee', targetId: emp._id, description: `Uploaded document "${req.file.originalname}" for ${emp.fullName}` });
  return respond.created(res, emp.documents[emp.documents.length - 1], 'Document uploaded');
}));

router.patch('/:id/documents/:docId', requirePermission('employees:update', 'documents:update'), asyncHandler(async (req, res) => {
  const emp = await Employee.findById(req.params.id);
  const doc = emp?.documents.id(req.params.docId);
  if (!emp || !doc) throw ApiError.notFound('Document not found');
  const { title, category, expiryDate, remarks, verified } = req.body;
  if (title) doc.title = title; if (category) doc.category = category; if (remarks !== undefined) doc.remarks = remarks;
  if (expiryDate !== undefined) doc.expiryDate = expiryDate ? new Date(expiryDate) : undefined;
  if (verified !== undefined) { doc.verified = !!verified; doc.verifiedBy = req.user._id; doc.verifiedAt = new Date(); }
  await emp.save();
  await recordAudit(req, { action: 'document.update', module: 'documents', targetId: doc._id, description: `Updated document ${doc.title} for ${emp.fullName}` });
  return respond.ok(res, doc, 'Document updated');
}));

router.delete('/:id/documents/:docId', requirePermission('employees:update', 'documents:delete'), asyncHandler(async (req, res) => {
  const emp = await Employee.findById(req.params.id);
  const doc = emp?.documents.id(req.params.docId);
  if (!emp || !doc) throw ApiError.notFound('Document not found');
  doc.deleteOne();
  await emp.save();
  await recordAudit(req, { action: 'document.delete', module: 'documents', targetId: req.params.docId, description: `Deleted document for ${emp.fullName}`, severity: 'warning' });
  return respond.ok(res, { _id: req.params.docId }, 'Document deleted');
}));

router.get('/:id/documents/:docId/download', asyncHandler(async (req, res) => {
  const emp = await Employee.findById(req.params.id);
  const doc = emp?.documents.id(req.params.docId);
  if (!emp || !doc) throw ApiError.notFound('Document not found');
  const isSelf = String(req.scope.selfEmployeeId || '') === String(emp._id);
  const privileged = ['super_admin', 'hr_admin', 'hr_manager'].includes(req.user.role);
  if (!isSelf && !privileged) {
    const canViewDocs = (req.user.__perms || []).includes('documents:view');
    if (!canViewDocs) throw ApiError.forbidden('You are not authorised to download this document');
    await assertCanActOnEmployee(req, emp._id).catch(() => { throw ApiError.forbidden('Document access restricted'); });
  }
  await recordAudit(req, { action: 'document.download', module: 'documents', targetId: doc._id, description: `Downloaded "${doc.title}" of ${emp.fullName}`, severity: 'warning' });
  if (!doc.file?.url) throw ApiError.notFound('File is unavailable');
  if (doc.file.url.startsWith('http')) return res.redirect(doc.file.url);
  return res.download(require('path').join(__dirname, '..', '..', doc.file.url.replace('/uploads', 'uploads')));
}));

/* ── NOTES ────────────────────────────────────────────────────────── */
router.post('/:id/notes', requirePermission('employees:update'), asyncHandler(async (req, res) => {
  if (!req.body.text) throw ApiError.badRequest('Note text is required');
  const emp = await Employee.findById(req.params.id);
  if (!emp) throw ApiError.notFound('Employee not found');
  emp.notes.push({ text: req.body.text, by: req.user._id, visibility: req.body.visibility || 'hr_only' });
  await emp.save();
  return respond.created(res, emp.notes[emp.notes.length - 1], 'Note added');
}));

/* ── LOGIN / ACCOUNT ──────────────────────────────────────────────── */
router.post('/:id/account/reset-password', requirePermission('users:update'), asyncHandler(async (req, res) => {
  const emp = await Employee.findById(req.params.id);
  if (!emp) throw ApiError.notFound('Employee not found');
  const user = emp.user ? await User.findById(emp.user) : null;
  if (!user) throw ApiError.badRequest('This employee has no login account');
  const tempPassword = req.body.password || req.body.newPassword || `Ems@${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 90 + 10)}`;
  user.password = tempPassword;
  await user.save();
  await recordAudit(req, { action: 'user.admin_reset_password', module: 'users', targetId: user._id, description: `Password reset for ${emp.fullName} by admin`, severity: 'critical' });
  return respond.ok(res, { temporaryPassword: tempPassword }, 'Password reset successfully');
}));

module.exports = router;
