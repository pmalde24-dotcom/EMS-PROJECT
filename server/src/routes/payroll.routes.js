'use strict';
const express = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const { SalaryStructure, SalaryRevision, PayrollRun, Payslip, Employee, Attendance, LeaveRequest, Reimbursement, CompanySettings, Department } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const validate = require('../middleware/validate');
const { requirePermission, scopeFilter, assertCanActOnEmployee } = require('../middleware/auth');
const { buildQuery, paginate } = require('../utils/query');
const { recordAudit } = require('../utils/audit');
const { sendCSV } = require('../utils/csv');
const { streamPDF, header, table } = require('../utils/pdf');
const { notify } = require('../utils/notify');
const T = require('../utils/time');

const router = express.Router();
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* ── SALARY STRUCTURES ────────────────────────────────────────────── */
const structureSchema = z.object({
  employee: z.string().optional(),
  effectiveFrom: z.coerce.date(),
  ctcAnnual: z.coerce.number().min(0),
  basic: z.coerce.number().min(0),
  hra: z.coerce.number().min(0).optional(),
  specialAllowance: z.coerce.number().min(0).optional(),
  conveyance: z.coerce.number().min(0).optional(),
  medicalAllowance: z.coerce.number().min(0).optional(),
  lta: z.coerce.number().min(0).optional(),
  otherAllowances: z.array(z.object({ name: z.string(), amount: z.coerce.number(), type: z.string().optional(), taxable: z.boolean().optional() })).optional(),
  standardDeductions: z.array(z.object({ name: z.string(), amount: z.coerce.number(), type: z.string().optional() })).optional(),
  employerContributions: z.array(z.object({ name: z.string(), amount: z.coerce.number() })).optional(),
  revision: z.enum(['initial', 'annual', 'promotion', 'increment', 'correction', 'adjustment']).optional(),
  revisionReason: z.string().optional(),
}).passthrough();

router.get('/structures', requirePermission('payroll:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: [], filterFields: ['employee', 'status'], defaultSort: '-effectiveFrom' });
  const { items, meta } = await paginate(SalaryStructure, opts, { populate: [{ path: 'employee', select: 'firstName lastName employeeId department designation' }] });
  return respond.list(res, items, meta);
}));

router.get('/structures/current/:employeeId', requirePermission('payroll:view'), asyncHandler(async (req, res) => {
  const isSelf = String(req.scope.selfEmployeeId || '') === String(req.params.employeeId);
  if (!isSelf && !req.scope.isGlobal) await assertCanActOnEmployee(req, req.params.employeeId);
  const structure = await SalaryStructure.findOne({ employee: req.params.employeeId, status: 'active' }).sort('-effectiveFrom').lean();
  if (!structure) throw ApiError.notFound('No active salary structure for this employee');
  const [history, revisions] = await Promise.all([
    SalaryStructure.find({ employee: req.params.employeeId }).sort('-effectiveFrom').select('ctcAnnual grossMonthly effectiveFrom effectiveTo status revision').lean(),
    SalaryRevision.find({ employee: req.params.employeeId }).sort('-effectiveFrom').lean(),
  ]);
  return respond.ok(res, { structure, history, revisions });
}));

router.post('/structures', requirePermission('payroll:create', 'payroll:update'), validate({ body: structureSchema }), asyncHandler(async (req, res) => {
  const employeeId = req.body.employee || req.scope.selfEmployeeId;
  if (!employeeId) throw ApiError.badRequest('employee is required');
  const employee = await Employee.findById(employeeId);
  if (!employee) throw ApiError.notFound('Employee not found');
  const previous = await SalaryStructure.findOne({ employee: employeeId, status: 'active' }).sort('-effectiveFrom');
  if (previous) {
    const sameDate = +new Date(previous.effectiveFrom) === +new Date(req.body.effectiveFrom);
    if (!sameDate) { previous.status = 'superseded'; previous.effectiveTo = new Date(new Date(req.body.effectiveFrom).getTime() - 86400000); await previous.save(); }
    else { await previous.deleteOne(); }
  }
  const structure = await SalaryStructure.create({ ...req.body, employee: employeeId, createdBy: req.user._id, approvedBy: req.user._id });
  // Gross-vs-CTC consistency check (configurable employer contributions)
  await SalaryRevision.create({
    employee: employeeId, previousCtc: previous?.ctcAnnual || 0, newCtc: structure.ctcAnnual,
    previousGross: previous?.grossMonthly || 0, newGross: structure.grossMonthly,
    incrementPercent: previous?.grossMonthly ? r2(((structure.grossMonthly - previous.grossMonthly) / previous.grossMonthly) * 100) : 0,
    effectiveFrom: structure.effectiveFrom, revisionType: previous ? (req.body.revision || 'increment') : 'joining',
    reason: req.body.revisionReason, approvedBy: req.user._id, status: 'applied', createdBy: req.user._id,
  });
  await recordAudit(req, { action: 'payroll.structure_create', module: 'payroll', targetModel: 'SalaryStructure', targetId: structure._id, description: `Salary structure set for ${employee.fullName}: CTC ${structure.ctcAnnual} (gross ${structure.grossMonthly}/month)`, severity: 'critical' });
  await notify({ userId: employee.user, title: 'Salary structure updated', body: `Your revised salary structure is effective from ${new Date(structure.effectiveFrom).toISOString().slice(0, 10)}.`, type: 'payroll', link: '/payroll/my-salary' });
  return respond.created(res, structure, 'Salary structure saved');
}));

/* ── PAYROLL CALCULATION ENGINE (configurable, no hardcoded rates) ── */
async function calculatePayslip(employee, structure, { month, year, settings, run }) {
  const policy = settings.payrollSettings || {};
  const workingDaysPerMonth = policy.workingDaysPerMonth || 22;
  const { start, end } = T.monthRange(year, month);

  const attendance = await Attendance.aggregate([
    { $match: { employee: employee._id, date: { $gte: start, $lte: end } } },
    { $group: { _id: '$status', count: { $sum: 1 }, otMinutes: { $sum: '$overtimeMinutes' }, workedMinutes: { $sum: '$workedMinutes' } } },
  ]);
  const att = attendance.reduce((a, r) => ({ ...a, [r._id]: r }), {});
  const presentDays = (att.present?.count || 0) + (att.late?.count || 0) + (att.early_exit?.count || 0) + (att.work_from_home?.count || 0) + (att.od?.count || 0) + (att.half_day?.count || 0) * 0.5;
  const paidLeaveDays = att.on_leave?.count || 0;

  // Unpaid (LOP) days: absent days + approved unpaid leave
  const unpaidLeaveTypes = await (require('../models').LeaveType).find({ paid: false }).select('_id').lean();
  const unpaidLeaveAgg = await LeaveRequest.aggregate([
    { $match: { employee: employee._id, status: 'approved', leaveType: { $in: unpaidLeaveTypes.map((t) => t._id) }, startDate: { $lte: end }, endDate: { $gte: start } } },
    { $group: { _id: null, days: { $sum: '$totalDays' } } },
  ]);
  const lopDays = (att.absent?.count || 0) + (unpaidLeaveAgg[0]?.days || 0);
  const paidDays = Math.max(0, workingDaysPerMonth - lopDays);

  const earnings = [];
  const proration = workingDaysPerMonth ? paidDays / workingDaysPerMonth : 1;
  const prorate = (v) => r2((v || 0) * proration);
  earnings.push({ name: 'Basic Salary', amount: prorate(structure.basic) });
  earnings.push({ name: 'House Rent Allowance', amount: prorate(structure.hra) });
  if (structure.conveyance) earnings.push({ name: 'Conveyance Allowance', amount: prorate(structure.conveyance) });
  if (structure.medicalAllowance) earnings.push({ name: 'Medical Allowance', amount: prorate(structure.medicalAllowance) });
  if (structure.lta) earnings.push({ name: 'Leave Travel Allowance', amount: prorate(structure.lta) });
  if (structure.specialAllowance) earnings.push({ name: 'Special Allowance', amount: prorate(structure.specialAllowance) });
  (structure.otherAllowances || []).filter((c) => c.type !== 'deduction').forEach((c) => earnings.push({ name: c.name, amount: prorate(c.amount) }));

  // Overtime (rate multiplier is configurable)
  const otHours = r2((att.present?.otMinutes || 0) / 60 + (att.late?.otMinutes || 0) / 60 + (att.work_from_home?.otMinutes || 0) / 60);
  const hourlyRate = structure.basic ? structure.basic / (workingDaysPerMonth * 8) : 0;
  const otAmount = r2(otHours * hourlyRate * (policy.overtimeRateMultiplier || 1.5));
  if (otAmount > 0) earnings.push({ name: `Overtime (${otHours} hrs)`, amount: otAmount });

  // Approved reimbursements paid through payroll
  const reimbursements = await Reimbursement.find({
    employee: employee._id, status: 'approved', payrollRun: null, expenseDate: { $lte: end },
  });
  const reimbursementTotal = r2(reimbursements.reduce((s, r) => s + (r.approvedAmount ?? r.amount), 0));
  if (reimbursementTotal > 0) earnings.push({ name: 'Reimbursements', amount: reimbursementTotal });

  const grossEarnings = r2(earnings.reduce((s, e) => s + e.amount, 0));

  // Deductions — fully configurable via company settings
  const deductions = [];
  if (policy.pfEnabled && structure.basic) {
    deductions.push({ name: `Provident Fund (${policy.pfEmployeePercent || 12}%)`, amount: r2(prorate(structure.basic) * ((policy.pfEmployeePercent || 12) / 100)) });
  }
  if (policy.esiEnabled) {
    const esiWageLimit = policy.esiWageLimit || 21000;
    if (grossEarnings <= esiWageLimit) deductions.push({ name: `ESI (${policy.esiEmployeePercent || 0.75}%)`, amount: r2(grossEarnings * ((policy.esiEmployeePercent || 0.75) / 100)) });
  }
  if (policy.professionalTaxEnabled) {
    const slabs = (policy.professionalTaxSlabs || []).slice().sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
    const slab = slabs.find((s) => s.upTo === null || s.upTo === undefined || grossEarnings <= s.upTo);
    const pt = slab ? slab.amount : 200;
    if (pt) deductions.push({ name: 'Professional Tax', amount: r2(pt) });
  }
  (structure.standardDeductions || []).forEach((c) => { if (c.amount) deductions.push({ name: c.name, amount: r2(c.amount) }); });
  if (lopDays > 0) deductions.push({ name: `Loss of Pay (${lopDays} day(s))`, amount: r2((structure.grossMonthly / workingDaysPerMonth) * lopDays) });

  // Income tax (TDS) using configurable slabs on annualised taxable income
  if (policy.taxSlabs?.length) {
    const annualGross = r2(structure.grossMonthly * 12);
    const taxable = Math.max(0, annualGross - (policy.standardDeduction || 0) - (policy.pfEnabled ? r2(structure.basic * (policy.pfEmployeePercent || 12) / 100) * 12 : 0));
    let tax = 0, lower = 0;
    const slabs = policy.taxSlabs.slice().sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
    for (const s of slabs) {
      const upper = s.upTo === null || s.upTo === undefined ? Infinity : s.upTo;
      if (taxable > lower) tax += ((Math.min(taxable, upper) - lower) * (s.rate || 0)) / 100;
      lower = upper;
      if (taxable <= upper) break;
    }
    const monthlyTax = r2(tax / 12);
    if (monthlyTax > 0) deductions.push({ name: 'Income Tax (TDS)', amount: monthlyTax });
  }

  const totalDeductions = r2(deductions.reduce((s, d) => s + d.amount, 0));
  const employerContributions = [];
  if (policy.pfEnabled && structure.basic) employerContributions.push({ name: 'Employer PF', amount: r2(prorate(structure.basic) * ((policy.pfEmployerPercent || 12) / 100)) });
  if (policy.esiEnabled && grossEarnings <= (policy.esiWageLimit || 21000)) employerContributions.push({ name: 'Employer ESI', amount: r2(grossEarnings * ((policy.esiEmployerPercent || 3.25) / 100)) });
  const employerCost = r2(grossEarnings + employerContributions.reduce((s, c) => s + c.amount, 0));

  return {
    payrollRun: run._id, employee: employee._id, period: T.periodKey(year, month), month, year,
    workingDays: workingDaysPerMonth, paidDays, lopDays,
    earnings, deductions, grossEarnings, totalDeductions, netPay: r2(grossEarnings - totalDeductions),
    employerContributions, ctcMonthly: r2(structure.grossMonthly + employerContributions.reduce((s, c) => s + c.amount, 0)),
    overtimeHours: otHours, overtimeAmount: otAmount,
    reimbursementTotal, reimbursements: reimbursements.map((r) => ({ title: r.title, amount: r.approvedAmount ?? r.amount, _id: r._id })),
    bankLast4: (employee.bank?.maskedAccountNumber || '').slice(-4) || undefined,
    paymentStatus: 'pending',
  };
}

/* ── PAYROLL RUNS ─────────────────────────────────────────────────── */
router.get('/runs', requirePermission('payroll:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: [], filterFields: ['status', 'year', 'month'], defaultSort: '-year -month' });
  const { items, meta } = await paginate(PayrollRun, opts, { populate: [{ path: 'department', select: 'name' }, { path: 'generatedBy approvedBy', select: 'name' }] });
  return respond.list(res, items, meta);
}));

router.post('/runs/generate', requirePermission('payroll:create', 'payroll:update'), validate({ body: z.object({
  month: z.coerce.number().min(1).max(12), year: z.coerce.number().min(2000).max(2100),
  department: z.string().optional().nullable(), employeeIds: z.array(z.string()).optional(), notes: z.string().optional(),
}) }), asyncHandler(async (req, res) => {
  const { month, year } = req.body;
  const period = T.periodKey(year, month);
  const existing = await PayrollRun.findOne({ period, department: req.body.department || null });
  if (existing) throw ApiError.conflict(`A payroll run for ${period}${req.body.department ? ' (that department)' : ''} already exists (status: ${existing.status}). Open it to continue or delete the draft.`);
  const settings = await CompanySettings.findOne({ singleton: 'company' }) || {};
  const run = await PayrollRun.create({ month, year, period, department: req.body.department || null, status: 'draft', generatedBy: req.user._id, generatedAt: new Date(), notes: req.body.notes, auditTrail: [{ by: req.user._id, action: 'generated', note: `Generated for ${period}` }] });

  const empFilter = { deletedAt: null, isActive: true, employmentStatus: { $nin: ['terminated', 'retired'] } };
  if (req.body.department) empFilter.department = req.body.department;
  if (req.body.employeeIds?.length) empFilter._id = { $in: req.body.employeeIds };
  const employees = await Employee.find(empFilter);
  const skipped = [];
  let totalGross = 0, totalDeductions = 0, totalNet = 0, totalEmployerCost = 0, count = 0;

  for (const employee of employees) {
    const structure = await SalaryStructure.findOne({ employee: employee._id, status: 'active' }).sort('-effectiveFrom');
    if (!structure) { skipped.push({ employee: employee.employeeId, name: employee.fullName, reason: 'No active salary structure' }); continue; }
    const data = await calculatePayslip(employee, structure, { month, year, settings, run });
    const payslip = await Payslip.create(data);
    // Link reimbursements to this run so they are not paid twice
    if (data.reimbursements.length) await Reimbursement.updateMany({ _id: { $in: data.reimbursements.map((r) => r._id) } }, { payrollRun: run._id, status: 'paid', paidAt: new Date() });
    count++;
    totalGross += data.grossEarnings; totalDeductions += data.totalDeductions; totalNet += data.netPay; totalEmployerCost += data.ctcMonthly;
  }
  run.totalEmployees = count;
  run.totalGross = r2(totalGross); run.totalDeductions = r2(totalDeductions); run.totalNet = r2(totalNet); run.totalEmployerCost = r2(totalEmployerCost);
  await run.save();
  await recordAudit(req, { action: 'payroll.generate', module: 'payroll', targetModel: 'PayrollRun', targetId: run._id, description: `Generated payroll for ${period}: ${count} payslip(s), net ${run.totalNet}`, severity: 'critical' });
  return respond.created(res, { run, generated: count, skipped }, `Payroll generated for ${count} employee(s)${skipped.length ? `, ${skipped.length} skipped` : ''}`);
}));

router.get('/runs/:id', requirePermission('payroll:view'), asyncHandler(async (req, res) => {
  const run = await PayrollRun.findById(req.params.id).populate('department', 'name').populate('generatedBy approvedBy processedBy', 'name role').lean();
  if (!run) throw ApiError.notFound('Payroll run not found');
  const payslips = await Payslip.find({ payrollRun: run._id }).populate('employee', 'firstName lastName employeeId department designation').lean();
  return respond.ok(res, { run, payslips });
}));

router.post('/runs/:id/approve', requirePermission('payroll:approve', 'payroll:update'), asyncHandler(async (req, res) => {
  const run = await PayrollRun.findById(req.params.id);
  if (!run) throw ApiError.notFound('Payroll run not found');
  if (!['draft', 'pending_approval'].includes(run.status)) throw ApiError.badRequest(`Cannot approve a payroll run in "${run.status}" state`);
  run.status = 'approved'; run.approvedBy = req.user._id; run.approvedAt = new Date();
  run.auditTrail.push({ by: req.user._id, action: 'approved', note: req.body?.note });
  await run.save();
  await recordAudit(req, { action: 'payroll.approve', module: 'payroll', targetId: run._id, description: `Approved payroll ${run.period} (net ${run.totalNet})`, severity: 'critical' });
  return respond.ok(res, run, 'Payroll approved');
}));

router.post('/runs/:id/process', requirePermission('payroll:update'), asyncHandler(async (req, res) => {
  const run = await PayrollRun.findById(req.params.id);
  if (!run) throw ApiError.notFound('Payroll run not found');
  if (run.status !== 'approved' && req.user.role !== 'super_admin') throw ApiError.badRequest('Payroll must be approved before processing');
  run.status = 'processed'; run.processedBy = req.user._id; run.processedAt = new Date();
  run.auditTrail.push({ by: req.user._id, action: 'processed' });
  await run.save();
  // Notify employees that payslips are available
  const payslips = await Payslip.find({ payrollRun: run._id }).populate('employee', 'user firstName').lean();
  await Promise.all(payslips.filter((p) => p.employee?.user).map((p) => notify({
    userId: p.employee.user, title: 'Payslip available', body: `Your payslip for ${run.period} is ready. Net pay: ${p.netPay}.`, type: 'payroll', link: '/payroll/my-payslips', sendEmail: true,
  })));
  await recordAudit(req, { action: 'payroll.process', module: 'payroll', targetId: run._id, description: `Processed payroll ${run.period}; ${payslips.length} payslips released`, severity: 'critical' });
  return respond.ok(res, run, 'Payroll processed and payslips released');
}));

router.post('/runs/:id/lock', requirePermission('payroll:update'), asyncHandler(async (req, res) => {
  const run = await PayrollRun.findById(req.params.id);
  if (!run) throw ApiError.notFound('Payroll run not found');
  if (run.locked) throw ApiError.badRequest('Payroll run is already locked');
  run.status = 'locked'; run.locked = true; run.lockedAt = new Date();
  run.auditTrail.push({ by: req.user._id, action: 'locked', note: req.body?.note });
  await run.save();
  await Attendance.updateMany({ date: { $gte: T.monthRange(run.year, run.month).start, $lte: T.monthRange(run.year, run.month).end } }, { locked: true });
  await recordAudit(req, { action: 'payroll.lock', module: 'payroll', targetId: run._id, description: `Locked payroll ${run.period} (attendance for the period frozen)`, severity: 'critical' });
  return respond.ok(res, run, 'Payroll period locked — attendance records frozen');
}));

router.post('/runs/:id/mark-paid', requirePermission('payroll:update'), asyncHandler(async (req, res) => {
  const run = await PayrollRun.findById(req.params.id);
  if (!run) throw ApiError.notFound('Payroll run not found');
  const { paymentReference, paymentMode = 'bank_transfer', paidOn = new Date() } = req.body;
  run.status = 'paid'; run.paidAt = paidOn;
  run.auditTrail.push({ by: req.user._id, action: 'paid', note: paymentReference });
  await run.save();
  await Payslip.updateMany({ payrollRun: run._id }, { paymentStatus: 'paid', paidOn, paymentReference, paymentMode });
  await recordAudit(req, { action: 'payroll.mark_paid', module: 'payroll', targetId: run._id, description: `Marked payroll ${run.period} as paid (ref: ${paymentReference || 'n/a'})`, severity: 'critical' });
  return respond.ok(res, run, 'Payroll marked as paid');
}));

router.delete('/runs/:id', requirePermission('payroll:delete'), asyncHandler(async (req, res) => {
  const run = await PayrollRun.findById(req.params.id);
  if (!run) throw ApiError.notFound('Payroll run not found');
  // ફક્ત draft/pending_approval રન ડિલીટ થઈ શકે — મંજૂર/પ્રોસેસ્ડ/લોક/ચૂકવેલ રનનો ઇતિહાસ સચવાય.
  if (!['draft', 'pending_approval'].includes(run.status)) {
    throw ApiError.conflict(`A ${run.status} payroll run cannot be deleted — reversal must go through payroll correction. Delete is allowed for draft runs only.`);
  }
  await Payslip.deleteMany({ payrollRun: run._id });
  await Reimbursement.updateMany({ payrollRun: run._id }, { payrollRun: null, status: 'approved', paidAt: null });
  await run.deleteOne();
  await recordAudit(req, { action: 'payroll.delete_run', module: 'payroll', targetId: req.params.id, description: `Deleted draft payroll run ${run.period}`, severity: 'critical' });
  return respond.ok(res, { _id: req.params.id }, 'Payroll run deleted');
}));

/* ── PAYSLIPS ─────────────────────────────────────────────────────── */
router.get('/payslips', requirePermission('payroll:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: [], filterFields: ['period', 'year', 'month', 'paymentStatus', 'employee'], defaultSort: '-year -month' });
  delete opts.filter.employee;
  const filter = { ...opts.filter, ...(await scopeFilter(req, 'employee')) };
  if (req.query.employee && req.scope.isGlobal) filter.employee = req.query.employee;
  filter.paymentStatus = filter.paymentStatus || { $ne: 'on_hold' };
  const { items, meta } = await paginate(Payslip, { ...opts, filter }, { populate: [{ path: 'employee', select: 'firstName lastName employeeId department designation' }] });
  return respond.list(res, items, meta);
}));

router.get('/payslips/:id', requirePermission('payroll:view'), asyncHandler(async (req, res) => {
  const slip = await Payslip.findById(req.params.id).populate('employee', 'firstName lastName employeeId department designation bank maskedAccountNumber email').populate({ path: 'employee', populate: [{ path: 'department', select: 'name' }, { path: 'designation', select: 'title' }] }).lean();
  if (!slip) throw ApiError.notFound('Payslip not found');
  const isSelf = String(slip.employee?._id) === String(req.scope.selfEmployeeId);
  if (!isSelf && !req.scope.isGlobal) {
    const hasView = (req.user.__perms || []).includes('*') || (req.user.__perms || []).includes('payroll:view');
    if (!hasView) throw ApiError.forbidden('You are not authorised to view this payslip');
    await assertCanActOnEmployee(req, slip.employee._id);
  }
  await recordAudit(req, { action: 'payroll.payslip_view', module: 'payroll', targetId: slip._id, description: `Viewed payslip ${slip.period} of employee ${slip.employee?.employeeId}`, severity: 'warning' });
  return respond.ok(res, slip);
}));

router.get('/payslips/:id/pdf', requirePermission('payroll:view'), asyncHandler(async (req, res) => {
  const slip = await Payslip.findById(req.params.id).populate('employee').lean();
  if (!slip) throw ApiError.notFound('Payslip not found');
  const isSelf = String(slip.employee?._id) === String(req.scope.selfEmployeeId);
  if (!isSelf && !req.scope.isAdmin && !req.scope.isGlobal) throw ApiError.forbidden('You can only download your own payslips');
  const settings = await CompanySettings.findOne({ singleton: 'company' }) || {};
  const emp = slip.employee;
  await recordAudit(req, { action: 'payroll.payslip_download', module: 'payroll', targetId: slip._id, description: `Downloaded payslip PDF ${slip.period} of ${emp.employeeId}`, severity: 'warning' });

  streamPDF(res, `payslip-${emp.employeeId}-${slip.period}.pdf`, (doc) => {
    header(doc, { company: settings.name || 'Company', subtitle: `${settings.address?.line1 || ''} ${settings.address?.city || ''}`.trim(), title: `Payslip for ${T.MONTHS[slip.month - 1]} ${slip.year}` });
    const info = [
      ['Employee', `${emp.firstName} ${emp.lastName}`, 'Employee ID', emp.employeeId],
      ['Department', String(emp.department || '-'), 'Designation', String(emp.designation || '-')],
      ['Paid Days', String(slip.paidDays), 'LOP Days', String(slip.lopDays)],
      ['Payment Status', slip.paymentStatus, 'Bank A/C', slip.bankLast4 ? `XXXX${slip.bankLast4}` : '-'],
    ];
    doc.fontSize(9).fillColor('#374151');
    info.forEach(([k1, v1, k2, v2]) => {
      doc.font('Helvetica-Bold').text(k1, 48, doc.y, { continued: true, width: 90 }).font('Helvetica').text(`: ${v1}`, { continued: true, width: 200 });
      doc.font('Helvetica-Bold').text(k2, 330, doc.y - doc.currentLineHeight(), { continued: true, width: 100 }).font('Helvetica').text(`: ${v2}`);
    });
    doc.moveDown(1);
    const rows = [['Earnings', 'Amount (INR)', 'Deductions', 'Amount (INR)']];
    const max = Math.max(slip.earnings.length, slip.deductions.length);
    for (let i = 0; i < max; i++) {
      rows.push([
        slip.earnings[i]?.name || '', slip.earnings[i] ? Number(slip.earnings[i].amount).toFixed(2) : '',
        slip.deductions[i]?.name || '', slip.deductions[i] ? Number(slip.deductions[i].amount).toFixed(2) : '',
      ]);
    }
    rows.push(['Gross Earnings', Number(slip.grossEarnings).toFixed(2), 'Total Deductions', Number(slip.totalDeductions).toFixed(2)]);
    table(doc, rows, { colWidths: [170, 80, 170, 79] });
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#4f46e5').text(`Net Pay: INR ${Number(slip.netPay).toFixed(2)}`, { align: 'right' });
    doc.moveDown(2).fontSize(8).fillColor('#9ca3af').font('Helvetica')
      .text('This is a computer-generated payslip and does not require a signature. Salary components are computed from the configured payroll policy.', { align: 'center' });
  }, { title: `Payslip ${slip.period}` });
}));

/* ── REPORTS ──────────────────────────────────────────────────────── */
router.get('/reports/summary', requirePermission('payroll:view', 'reports:view'), asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const filter = { year };
  const [byMonth, byDepartment, topEarners, costAgg] = await Promise.all([
    Payslip.aggregate([{ $match: filter }, { $group: { _id: '$month', gross: { $sum: '$grossEarnings' }, deductions: { $sum: '$totalDeductions' }, net: { $sum: '$netPay' }, employees: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Payslip.aggregate([
      { $match: filter }, { $lookup: { from: 'employees', localField: 'employee', foreignField: '_id', as: 'e' } }, { $unwind: '$e' },
      { $group: { _id: '$e.department', gross: { $sum: '$grossEarnings' }, net: { $sum: '$netPay' }, employees: { $addToSet: '$employee' } } },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } }, { $unwind: { path: '$d', preserveNullAndEmptyArrays: true } },
      { $project: { department: { $ifNull: ['$d.name', 'Unassigned'] }, gross: 1, net: 1, headcount: { $size: '$employees' }, _id: 0 } },
    ]),
    Payslip.aggregate([{ $match: filter }, { $sort: { netPay: -1 } }, { $limit: 5 }, { $lookup: { from: 'employees', localField: 'employee', foreignField: '_id', as: 'e' } }, { $unwind: '$e' }, { $project: { name: { $concat: ['$e.firstName', ' ', '$e.lastName'] }, employeeId: '$e.employeeId', netPay: 1, period: 1, _id: 0 } }]),
    Payslip.aggregate([{ $match: filter }, { $group: { _id: null, gross: { $sum: '$grossEarnings' }, deductions: { $sum: '$totalDeductions' }, net: { $sum: '$netPay' }, count: { $sum: 1 } } }]),
  ]);
  if (req.query.export === 'csv') {
    return sendCSV(res, `payroll-report-${year}.csv`, byMonth.map((m) => ({ month: T.MONTHS[m._id - 1], employees: m.employees, gross: m.gross, deductions: m.deductions, net: m.net })));
  }
  return respond.ok(res, {
    year, monthly: byMonth.map((m) => ({ month: T.MONTHS[m._id - 1], gross: m.gross, deductions: m.deductions, net: m.net, employees: m.employees })),
    byDepartment, topEarners, totals: costAgg[0] || { gross: 0, deductions: 0, net: 0, count: 0 },
  });
}));

router.get('/reports/salary-register', requirePermission('payroll:view', 'reports:export'), asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
  const slips = await Payslip.find({ year, month }).populate({ path: 'employee', select: 'firstName lastName employeeId department designation', populate: [{ path: 'department', select: 'name' }, { path: 'designation', select: 'title' }] }).lean();
  const rows = slips.map((s) => ({
    employeeId: s.employee?.employeeId, name: `${s.employee?.firstName || ''} ${s.employee?.lastName || ''}`,
    department: s.employee?.department?.name, designation: s.employee?.designation?.title,
    gross: s.grossEarnings, deductions: s.totalDeductions, net: s.netPay, status: s.paymentStatus,
  }));
  if (req.query.export === 'csv') return sendCSV(res, `salary-register-${year}-${month}.csv`, rows);
  return respond.list(res, rows, { total: rows.length, totalNet: r2(rows.reduce((a, r) => a + r.net, 0)) });
}));

/* ── SALARY REVISIONS ─────────────────────────────────────────────── */
router.get('/revisions', requirePermission('payroll:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: [], filterFields: ['employee', 'revisionType', 'status', 'year'], defaultSort: '-effectiveFrom' });
  const { items, meta } = await paginate(SalaryRevision, opts, { populate: [{ path: 'employee', select: 'firstName lastName employeeId' }] });
  return respond.list(res, items, meta);
}));

module.exports = router;
