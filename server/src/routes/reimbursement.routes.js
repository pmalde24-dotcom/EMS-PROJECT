'use strict';
const express = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const { Reimbursement, Employee, Project, PayrollRun } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const validate = require('../middleware/validate');
const { requirePermission, scopeFilter, assertCanActOnEmployee, directReportIds } = require('../middleware/auth');
const { buildQuery, paginate } = require('../utils/query');
const { recordAudit } = require('../utils/audit');
const { sendCSV } = require('../utils/csv');
const { notify } = require('../utils/notify');
const { nextCode } = require('../utils/sequence');

const router = express.Router();
const POPULATE = [
  { path: 'employee', select: 'firstName lastName employeeId department designation' },
  { path: 'approvals.approver', select: 'name role' },
  { path: 'project', select: 'name code' },
];

async function ensureSelf(req) {
  if (req.scope.selfEmployeeId) return req.scope.selfEmployeeId;
  const emp = await Employee.findOne({ user: req.user._id, deletedAt: null }).select('_id');
  if (!emp) throw ApiError.forbidden('Your login is not linked to an employee record.');
  req.scope.selfEmployeeId = emp._id;
  return emp._id;
}

/* ── LIST ─────────────────────────────────────────────────────────── */
router.get('/', requirePermission('reimbursements:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: ['title', 'description', 'claimNo'], filterFields: ['status', 'category', 'employee'], defaultSort: '-createdAt' });
  delete opts.filter.employee;
  Object.assign(opts.filter, await scopeFilter(req, 'employee'));
  if (req.query.employee && req.scope.isGlobal) opts.filter.employee = req.query.employee;
  const { items, meta } = await paginate(Reimbursement, opts, { populate: POPULATE });
  if (req.query.export === 'csv') {
    return sendCSV(res, `reimbursements-${Date.now()}.csv`, items, [
      { key: 'claimNo', label: 'Claim No' }, { key: 'employee.employeeId', label: 'Employee ID' },
      { key: 'employee.firstName', label: 'First Name' }, { key: 'employee.lastName', label: 'Last Name' },
      { key: 'category', label: 'Category' }, { key: 'title', label: 'Title' },
      { key: 'amount', label: 'Claimed' }, { key: 'approvedAmount', label: 'Approved' },
      { key: 'status', label: 'Status' }, { key: 'expenseDate', label: 'Expense Date', value: (r) => new Date(r.expenseDate).toISOString().slice(0, 10) },
    ]);
  }
  return respond.list(res, items, meta);
}));

router.get('/summary/stats', requirePermission('reimbursements:view'), asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const base = { expenseDate: { $gte: new Date(Date.UTC(year, 0, 1)), $lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59)) } };
  if (!req.scope.isGlobal) base.employee = req.scope.selfEmployeeId;
  const [byStatus, byCategory, monthly] = await Promise.all([
    Reimbursement.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' }, approved: { $sum: '$approvedAmount' } } }]),
    Reimbursement.aggregate([{ $match: base }, { $group: { _id: '$category', count: { $sum: 1 }, amount: { $sum: '$amount' } } }, { $sort: { amount: -1 } }]),
    Reimbursement.aggregate([{ $match: base }, { $group: { _id: { m: { $month: '$expenseDate' } }, amount: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { '_id.m': 1 } }]),
  ]);
  return respond.ok(res, { year, byStatus, byCategory, monthly });
}));

router.get('/pending-approvals', requirePermission('reimbursements:approve', 'reimbursements:view'), asyncHandler(async (req, res) => {
  const filter = { status: 'pending' };
  if (!req.scope.isGlobal) {
    const ids = [req.scope.selfEmployeeId, ...(await directReportIds(req.scope.selfEmployeeId))].filter(Boolean);
    filter.employee = { $in: ids };
  }
  const items = await Reimbursement.find(filter).populate(POPULATE).sort('expenseDate').lean();
  return respond.list(res, items, { total: items.length });
}));

router.get('/:id', requirePermission('reimbursements:view'), asyncHandler(async (req, res) => {
  const claim = await Reimbursement.findById(req.params.id).populate(POPULATE).lean();
  if (!claim) throw ApiError.notFound('Claim not found');
  const isSelf = String(claim.employee?._id) === String(req.scope.selfEmployeeId);
  if (!req.scope.isGlobal && !isSelf) await assertCanActOnEmployee(req, claim.employee._id);
  return respond.ok(res, claim);
}));

/* ── SUBMIT CLAIM ─────────────────────────────────────────────────── */
router.post('/', requirePermission('reimbursements:create'), validate({ body: z.object({
  category: z.enum(['travel', 'accommodation', 'food', 'fuel', 'internet', 'mobile', 'medical', 'training', 'client_entertainment', 'office_supplies', 'relocation', 'other']),
  title: z.string().min(3), description: z.string().optional(),
  amount: z.coerce.number().min(1, 'Amount must be greater than zero'),
  expenseDate: z.coerce.date(), project: z.string().optional().nullable(),
  receipts: z.array(z.object({ fileName: z.string().optional(), url: z.string(), fileType: z.string().optional(), size: z.number().optional() })).optional(),
  employeeId: z.string().optional(),
}) }), asyncHandler(async (req, res) => {
  const employeeId = req.body.employeeId && req.scope.isGlobal ? req.body.employeeId : await ensureSelf(req);
  const employee = await Employee.findById(employeeId);
  if (!employee) throw ApiError.notFound('Employee not found');
  if (new Date(req.body.expenseDate) > new Date()) throw ApiError.badRequest('Expense date cannot be in the future');
  const settings = await require('../models').CompanySettings.findOne({ singleton: 'company' });
  const claimNo = await nextCode('RMB{YYYY}{SEQ:5}', { prefix: 'RMB', seqKey: 'reimbursement' });
  void settings;
  const claim = await Reimbursement.create({
    claimNo, employee: employeeId, category: req.body.category, title: req.body.title, description: req.body.description,
    amount: req.body.amount, expenseDate: req.body.expenseDate, project: req.body.project || undefined,
    receipts: req.body.receipts || [], status: 'pending', currentLevel: 1,
    approvals: [{ level: 1, role: 'manager', status: 'pending' }, { level: 2, role: 'finance', status: 'pending' }],
    auditTrail: [{ by: req.user._id, action: 'submitted', note: `${claimNo} submitted for ${req.body.amount}` }],
  });
  const mgr = employee.reportingManager ? await Employee.findById(employee.reportingManager).select('user').lean() : null;
  await notify({ userId: mgr?.user, title: 'Expense claim awaiting approval', body: `${employee.fullName} submitted ${claimNo} for ₹${req.body.amount} (${req.body.category}).`, type: 'reimbursement', link: `/reimbursements/${claim._id}`, sendEmail: true });
  await recordAudit(req, { action: 'reimbursement.create', module: 'reimbursements', targetModel: 'Reimbursement', targetId: claim._id, description: `Expense claim ${claimNo} submitted (₹${req.body.amount})` });
  return respond.created(res, claim, 'Expense claim submitted');
}));

/* ── APPROVE / REJECT ─────────────────────────────────────────────── */
router.post('/:id/decide', requirePermission('reimbursements:approve', 'reimbursements:update'), validate({ body: z.object({
  decision: z.enum(['approved', 'rejected']), comment: z.string().optional(), approvedAmount: z.coerce.number().optional(),
}) }), asyncHandler(async (req, res) => {
  const claim = await Reimbursement.findById(req.params.id).populate('employee');
  if (!claim) throw ApiError.notFound('Claim not found');
  if (!['pending'].includes(claim.status)) throw ApiError.badRequest(`Claim is already ${claim.status}`);
  const step = claim.approvals.find((a) => a.level === claim.currentLevel && a.status === 'pending');
  if (!step) throw ApiError.badRequest('No pending approval step');
  if (String(claim.employee._id) === String(req.scope.selfEmployeeId)) throw ApiError.forbidden('You cannot approve your own claim');
  if (step.role === 'manager' && !req.scope.isGlobal) {
    const ids = [req.scope.selfEmployeeId, ...(await directReportIds(req.scope.selfEmployeeId))].map(String);
    if (!ids.includes(String(claim.employee._id))) throw ApiError.forbidden('This employee is not in your team');
    if (!['department_manager', 'team_leader', 'super_admin', 'hr_admin', 'hr_manager'].includes(req.user.role)) throw ApiError.forbidden('Not authorised for this approval step');
  }
  step.status = req.body.decision; step.approver = req.user._id; step.decidedAt = new Date(); step.comment = req.body.comment;

  if (req.body.decision === 'rejected') {
    claim.status = 'rejected'; claim.rejectionReason = req.body.comment || 'Rejected';
  } else {
    const remaining = claim.approvals.filter((a) => a.status === 'pending');
    if (remaining.length) {
      claim.currentLevel = Math.min(...remaining.map((a) => a.level));
      step.comment = req.body.comment;
    } else {
      claim.status = 'approved';
      claim.approvedAmount = req.body.approvedAmount ?? claim.amount;
    }
  }
  claim.auditTrail.push({ by: req.user._id, action: req.body.decision, note: req.body.comment });
  await claim.save();
  await notify({
    userId: claim.employee.user, title: `Expense claim ${claim.status}`,
    body: `Your claim ${claim.claimNo} (₹${claim.amount}) was ${claim.status}${req.body.comment ? ` — ${req.body.comment}` : ''}.`, type: 'reimbursement', link: `/reimbursements/${claim._id}`, sendEmail: true,
  });
  await recordAudit(req, { action: `reimbursement.${req.body.decision}`, module: 'reimbursements', targetId: claim._id, description: `Claim ${claim.claimNo} ${req.body.decision} at level ${step.level}`, severity: 'warning' });
  const nextStep = claim.approvals.find((a) => a.status === 'pending');
  const msg = req.body.decision === 'rejected'
    ? 'Claim rejected'
    : nextStep ? `Approval recorded — awaiting ${nextStep.role} approval (level ${nextStep.level})` : 'Claim fully approved';
  return respond.ok(res, claim, msg);
}));

router.post('/:id/paid', requirePermission('reimbursements:update'), validate({ body: z.object({ paymentReference: z.string().optional(), paidAt: z.coerce.date().optional() }) }), asyncHandler(async (req, res) => {
  const claim = await Reimbursement.findById(req.params.id);
  if (!claim) throw ApiError.notFound('Claim not found');
  if (claim.status !== 'approved') throw ApiError.badRequest('Only approved claims can be marked paid');
  claim.status = 'paid'; claim.paidAt = req.body.paidAt || new Date(); claim.paymentReference = req.body.paymentReference;
  claim.auditTrail.push({ by: req.user._id, action: 'paid', note: req.body.paymentReference });
  await claim.save();
  await recordAudit(req, { action: 'reimbursement.paid', module: 'reimbursements', targetId: claim._id, description: `Claim ${claim.claimNo} marked paid`, severity: 'warning' });
  return respond.ok(res, claim, 'Claim marked as paid');
}));

router.delete('/:id', requirePermission('reimbursements:delete', 'reimbursements:update'), asyncHandler(async (req, res) => {
  const claim = await Reimbursement.findById(req.params.id);
  if (!claim) throw ApiError.notFound('Claim not found');
  const isSelf = String(claim.employee) === String(req.scope.selfEmployeeId);
  if (isSelf && claim.status !== 'pending') throw ApiError.badRequest('Only pending claims can be withdrawn');
  if (!isSelf && !req.scope.isGlobal) throw ApiError.forbidden('Not authorised');
  claim.status = 'cancelled';
  await claim.save();
  return respond.ok(res, { _id: claim._id }, 'Claim cancelled');
}));

module.exports = router;
