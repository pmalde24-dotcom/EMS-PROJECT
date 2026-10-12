'use strict';
const express = require('express');
const { z } = require('zod');
const { Offboarding, Employee, Asset, AssetAssignment, LeaveBalance, SalaryStructure, User, RefreshToken, CompanySettings, Task } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const validate = require('../middleware/validate');
const { requirePermission, scopeFilter, assertCanActOnEmployee } = require('../middleware/auth');
const { buildQuery, paginate } = require('../utils/query');
const { recordAudit } = require('../utils/audit');
const { notify } = require('../utils/notify');
const { streamPDF, header, table, inr } = require('../utils/pdf');

const router = express.Router();
const POPULATE = [{ path: 'employee', select: 'firstName lastName employeeId email joiningDate department designation reportingManager profilePhoto' }, { path: 'approvals.approver', select: 'name role' }];

const DEFAULT_CHECKLIST = [
  { title: 'Knowledge transfer document completed', category: 'handover', ownerRole: 'employee' },
  { title: 'Pending tasks reassigned to team', category: 'handover', ownerRole: 'manager' },
  { title: 'Return laptop / desktop', category: 'asset_return', ownerRole: 'employee' },
  { title: 'Return access card & ID', category: 'asset_return', ownerRole: 'employee' },
  { title: 'Return mobile / SIM', category: 'asset_return', ownerRole: 'employee' },
  { title: 'Email account & system access revoked', category: 'access_revocation', ownerRole: 'it' },
  { title: 'VPN / database credentials revoked', category: 'access_revocation', ownerRole: 'it' },
  { title: 'Exit interview conducted', category: 'hr', ownerRole: 'hr' },
  { title: 'Leave & attendance reconciliation', category: 'finance', ownerRole: 'hr' },
  { title: 'Final settlement calculated & approved', category: 'finance', ownerRole: 'finance' },
  { title: 'Full & final payment released', category: 'finance', ownerRole: 'finance' },
  { title: 'Relieving & experience letters issued', category: 'documentation', ownerRole: 'hr' },
  { title: 'Employee record archived (history preserved)', category: 'documentation', ownerRole: 'hr' },
];

/* ── LIST ─────────────────────────────────────────────────────────── */
router.get('/', requirePermission('offboarding:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: ['reasonDetails'], filterFields: ['status', 'reason'], defaultSort: '-createdAt' });
  const { items, meta } = await paginate(Offboarding, opts, { populate: POPULATE });
  return respond.list(res, items, meta);
}));

router.get('/:id', requirePermission('offboarding:view'), asyncHandler(async (req, res) => {
  const record = await Offboarding.findById(req.params.id).populate(POPULATE).populate('assetsReturned.asset', 'assetId name category').populate('exitInterview.conductedBy', 'name').lean();
  if (!record) throw ApiError.notFound('Offboarding record not found');
  const isSelf = String(record.employee?._id) === String(req.scope.selfEmployeeId);
  if (!req.scope.isGlobal && !isSelf && !['department_manager', 'team_leader'].includes(req.user.role)) throw ApiError.forbidden('Not authorised');
  return respond.ok(res, record);
}));

/* ── RESIGNATION SUBMISSION ──────────────────────────────────────── */
router.post('/', requirePermission('offboarding:create', 'offboarding:update'), validate({ body: z.object({
  employeeId: z.string().optional(), resignationDate: z.coerce.date(), lastWorkingDay: z.coerce.date(),
  reason: z.enum(['better_opportunity', 'higher_studies', 'relocation', 'health', 'family', 'compensation', 'work_environment', 'career_change', 'termination', 'retirement', 'absconding', 'other']),
  reasonDetails: z.string().optional(), noticePeriodDays: z.coerce.number().optional(),
}) }), asyncHandler(async (req, res) => {
  const employeeId = req.body.employeeId && req.scope.isGlobal ? req.body.employeeId : req.scope.selfEmployeeId;
  if (!employeeId) throw ApiError.forbidden('Your login is not linked to an employee record');
  const employee = await Employee.findById(employeeId);
  if (!employee) throw ApiError.notFound('Employee not found');
  if (new Date(req.body.lastWorkingDay) < new Date(req.body.resignationDate)) throw ApiError.badRequest('Last working day cannot be before the resignation date');
  const existing = await Offboarding.findOne({ employee: employeeId, status: { $nin: ['completed', 'withdrawn', 'rejected'] } });
  if (existing) throw ApiError.conflict('An active offboarding process already exists for this employee');

  const noticeDays = req.body.noticePeriodDays || employee.noticePeriodDays || 30;
  const served = Math.max(0, Math.round((new Date(req.body.lastWorkingDay) - new Date(req.body.resignationDate)) / 86400000));
  const shortfall = Math.max(0, noticeDays - served);

  const record = await Offboarding.create({
    employee: employeeId, resignationDate: req.body.resignationDate, lastWorkingDay: req.body.lastWorkingDay,
    noticePeriodDays: noticeDays, noticeServedDays: served, noticeShortfallDays: shortfall,
    reason: req.body.reason, reasonDetails: req.body.reasonDetails, status: 'submitted',
    approvals: [{ level: 1, role: 'manager', status: 'pending' }, { level: 2, role: 'hr', status: 'pending' }],
    tasks: DEFAULT_CHECKLIST,
    exitInterview: { mode: 'form' },
    auditTrail: [{ by: req.user._id, action: 'submitted', note: `Resignation submitted; LWD ${new Date(req.body.lastWorkingDay).toISOString().slice(0, 10)}` }],
  });
  employee.resignationDate = req.body.resignationDate;
  employee.lastWorkingDay = req.body.lastWorkingDay;
  employee.employmentStatus = 'notice_period';
  await employee.save();
  const mgr = employee.reportingManager ? await Employee.findById(employee.reportingManager).select('user').lean() : null;
  await notify({ userId: mgr?.user, title: 'Resignation submitted', body: `${employee.fullName} has submitted resignation. Last working day: ${new Date(req.body.lastWorkingDay).toDateString()}.`, type: 'offboarding', link: `/offboarding/${record._id}`, sendEmail: true });
  await recordAudit(req, { action: 'offboarding.submit', module: 'offboarding', targetModel: 'Offboarding', targetId: record._id, description: `Resignation submitted for ${employee.fullName} (LWD ${new Date(req.body.lastWorkingDay).toISOString().slice(0, 10)})`, severity: 'critical' });
  return respond.created(res, record, 'Resignation submitted');
}));

/* ── APPROVE / REJECT ────────────────────────────────────────────── */
router.post('/:id/decide', requirePermission('offboarding:approve', 'offboarding:update'), validate({ body: z.object({ decision: z.enum(['approved', 'rejected']), comment: z.string().optional() }) }), asyncHandler(async (req, res) => {
  const record = await Offboarding.findById(req.params.id).populate('employee');
  if (!record) throw ApiError.notFound('Offboarding record not found');
  if (!['submitted', 'approved', 'in_progress'].includes(record.status)) throw ApiError.badRequest(`Record is already ${record.status}`);
  const step = record.approvals.find((a) => a.status === 'pending');
  if (step) {
    if (step.role === 'hr' && !req.scope.isGlobal && !['hr_admin', 'hr_manager'].includes(req.user.role)) throw ApiError.forbidden('HR approval required');
    // Manager-level step: a non-global approver must actually be this employee's manager/team leader.
    if (step.role === 'manager' && !req.scope.isGlobal) {
      const emp = await Employee.findById(record.employee._id || record.employee).select('reportingManager teamLeader').lean();
      const mine = [String(emp?.reportingManager || ''), String(emp?.teamLeader || '')];
      if (!mine.includes(String(req.scope.selfEmployeeId || ''))) throw ApiError.forbidden('Manager approval required — this employee does not report to you');
    }
    step.status = req.body.decision; step.approver = req.user._id; step.decidedAt = new Date(); step.comment = req.body.comment;
  }
  if (req.body.decision === 'rejected') {
    record.status = 'rejected';
    await Employee.findByIdAndUpdate(record.employee._id, { employmentStatus: 'active', resignationDate: null, lastWorkingDay: null });
  } else {
    const pending = record.approvals.some((a) => a.status === 'pending');
    record.status = pending ? 'approved' : 'in_progress';
  }
  record.auditTrail.push({ by: req.user._id, action: req.body.decision, note: req.body.comment });
  await record.save();
  await notify({ userId: record.employee.user, title: `Resignation ${req.body.decision}`, body: `Your resignation has been ${req.body.decision}.${req.body.comment ? ` Note: ${req.body.comment}` : ''}`, type: 'offboarding', link: `/offboarding/${record._id}`, sendEmail: true });
  await recordAudit(req, { action: `offboarding.${req.body.decision}`, module: 'offboarding', targetId: record._id, description: `Resignation ${req.body.decision} for ${record.employee.fullName}`, severity: 'critical' });
  return respond.ok(res, record, `Resignation ${req.body.decision}`);
}));

/* ── EXIT CHECKLIST ──────────────────────────────────────────────── */
router.patch('/:id/tasks/:taskId', requirePermission('offboarding:update'), asyncHandler(async (req, res) => {
  const record = await Offboarding.findById(req.params.id);
  const task = record?.tasks.id(req.params.taskId);
  if (!record || !task) throw ApiError.notFound('Checklist item not found');
  const isSelf = String(record.employee) === String(req.scope.selfEmployeeId);
  if (!req.scope.isGlobal && !isSelf && !['department_manager', 'team_leader'].includes(req.user.role)) throw ApiError.forbidden('Not authorised');
  if (req.body.title) task.title = req.body.title;
  if (req.body.status) { task.status = req.body.status; if (['completed', 'waived'].includes(req.body.status)) { task.completedAt = new Date(); task.completedBy = req.user._id; } }
  if (req.body.remarks !== undefined) task.remarks = req.body.remarks;
  await record.save();
  return respond.ok(res, task, 'Checklist updated');
}));

router.post('/:id/tasks', requirePermission('offboarding:update'), asyncHandler(async (req, res) => {
  const record = await Offboarding.findById(req.params.id);
  if (!record) throw ApiError.notFound('Offboarding record not found');
  record.tasks.push({ title: req.body.title, category: req.body.category || 'other', ownerRole: req.body.ownerRole || 'hr' });
  await record.save();
  return respond.created(res, record.tasks[record.tasks.length - 1], 'Checklist item added');
}));

/* ── ASSET RETURN ────────────────────────────────────────────────── */
router.post('/:id/assets/:assignmentId/return', requirePermission('offboarding:update', 'assets:update'), validate({ body: z.object({
  conditionAtReturn: z.enum(['new', 'good', 'fair', 'poor', 'damaged']).optional(), returnNotes: z.string().optional(),
  damage: z.object({ description: z.string(), cost: z.coerce.number().optional(), recoveredFromEmployee: z.boolean().optional() }).optional(),
}) }), asyncHandler(async (req, res) => {
  const record = await Offboarding.findById(req.params.id).populate('employee', 'firstName lastName');
  if (!record) throw ApiError.notFound('Offboarding record not found');
  const assignment = await AssetAssignment.findById(req.params.assignmentId);
  if (!assignment || String(assignment.employee) !== String(record.employee._id)) throw ApiError.notFound('Asset assignment not found for this employee');
  if (assignment.status === 'returned') throw ApiError.badRequest('This asset has already been returned');
  assignment.status = 'returned'; assignment.returnedAt = new Date(); assignment.receivedBy = req.user._id;
  assignment.conditionAtReturn = req.body.conditionAtReturn || 'good'; assignment.returnNotes = req.body.returnNotes;
  if (req.body.damage) assignment.damageReport = { reported: true, description: req.body.damage.description, cost: req.body.damage.cost || 0, recoveredFromEmployee: !!req.body.damage.recoveredFromEmployee, reportedAt: new Date() };
  await assignment.save();
  const asset = await Asset.findById(assignment.asset);
  if (asset) { asset.status = req.body.damage ? 'maintenance' : 'available'; asset.currentHolder = null; asset.assignedAt = null; asset.condition = req.body.conditionAtReturn || asset.condition; if (req.body.damage) asset.status = 'maintenance'; await asset.save(); }
  const entry = record.assetsReturned.find((a) => String(a.asset) === String(assignment.asset));
  if (entry) { entry.isReturned = true; entry.returnedAt = new Date(); entry.condition = assignment.conditionAtReturn; entry.notes = req.body.returnNotes; }
  else record.assetsReturned.push({ asset: assignment.asset, returnedAt: new Date(), condition: assignment.conditionAtReturn, notes: req.body.returnNotes, isReturned: true });
  record.auditTrail.push({ by: req.user._id, action: 'asset_returned', note: `${asset?.name || 'Asset'} returned (${assignment.conditionAtReturn})` });
  await record.save();
  await recordAudit(req, { action: 'offboarding.asset_return', module: 'offboarding', targetId: record._id, description: `Asset returned by ${record.employee.firstName} ${record.employee.lastName}`, severity: 'warning' });
  return respond.ok(res, { assignment, asset }, 'Asset returned and inventory updated');
}));

/* ── ACCESS REVOCATION ───────────────────────────────────────────── */
router.post('/:id/revoke-access', requirePermission('offboarding:update'), validate({ body: z.object({ email: z.boolean().optional(), system: z.boolean().optional(), building: z.boolean().optional(), vpn: z.boolean().optional() }) }), asyncHandler(async (req, res) => {
  const record = await Offboarding.findById(req.params.id).populate('employee');
  if (!record) throw ApiError.notFound('Offboarding record not found');
  record.accessRevoked = { email: req.body.email ?? true, system: req.body.system ?? true, building: req.body.building ?? true, vpn: req.body.vpn ?? true, revokedAt: new Date(), revokedBy: req.user._id };
  if (record.employee.user) {
    await User.findByIdAndUpdate(record.employee.user, { isActive: false });
    await RefreshToken.updateMany({ user: record.employee.user, revokedAt: null }, { revokedAt: new Date() });
  }
  record.auditTrail.push({ by: req.user._id, action: 'access_revoked', note: 'System access revoked' });
  await record.save();
  await recordAudit(req, { action: 'offboarding.revoke_access', module: 'offboarding', targetId: record._id, description: `Access revoked for ${record.employee.fullName}`, severity: 'critical' });
  return respond.ok(res, record.accessRevoked, 'Access revoked and sessions terminated');
}));

/* ── EXIT INTERVIEW ──────────────────────────────────────────────── */
router.post('/:id/exit-interview', requirePermission('offboarding:update'), validate({ body: z.object({
  ratings: z.object({ workEnvironment: z.coerce.number().optional(), management: z.coerce.number().optional(), compensation: z.coerce.number().optional(), growth: z.coerce.number().optional(), workLifeBalance: z.coerce.number().optional() }).optional(),
  feedback: z.string().optional(), suggestions: z.string().optional(), wouldRecommend: z.boolean().optional(), rehireEligible: z.boolean().optional(), notes: z.string().optional(),
  scheduledAt: z.coerce.date().optional(), mode: z.enum(['in_person', 'video', 'phone', 'form']).optional(),
}) }), asyncHandler(async (req, res) => {
  const record = await Offboarding.findById(req.params.id);
  if (!record) throw ApiError.notFound('Offboarding record not found');
  const isSelf = String(record.employee) === String(req.scope.selfEmployeeId);
  if (!req.scope.isGlobal && !isSelf) throw ApiError.forbidden('Not authorised');
  record.exitInterview = {
    ...record.exitInterview.toObject?.() ?? record.exitInterview,
    ...req.body, ratings: { ...(record.exitInterview?.ratings || {}), ...(req.body.ratings || {}) },
    conductedBy: isSelf ? record.exitInterview?.conductedBy : req.user._id, conductedAt: new Date(),
  };
  record.auditTrail.push({ by: req.user._id, action: 'exit_interview', note: 'Exit interview recorded' });
  await record.save();
  return respond.ok(res, record.exitInterview, 'Exit interview saved');
}));

/* ── RECONCILIATION ──────────────────────────────────────────────── */
router.get('/:id/reconciliation', requirePermission('offboarding:view', 'payroll:view'), asyncHandler(async (req, res) => {
  const record = await Offboarding.findById(req.params.id).populate('employee');
  if (!record) throw ApiError.notFound('Offboarding record not found');
  const year = new Date().getFullYear();
  const [balances, structure, assets, pendingTasks] = await Promise.all([
    LeaveBalance.find({ employee: record.employee._id, year }).populate('leaveType', 'name paid encashable').lean({ virtuals: true }),
    SalaryStructure.findOne({ employee: record.employee._id, status: 'active' }).lean(),
    AssetAssignment.find({ employee: record.employee._id, status: 'assigned' }).populate('asset', 'assetId name category').lean(),
    Task.countDocuments({ assignees: record.employee._id, status: { $in: ['todo', 'in_progress', 'in_review'] }, deletedAt: null }),
  ]);
  const leaveDays = balances.reduce((s, b) => s + (b.available || 0), 0);
  const encashableDays = balances.filter((b) => b.leaveType?.encashable).reduce((s, b) => s + (b.available || 0), 0);
  const perDay = structure ? structure.grossMonthly / 22 : 0;
  const noticeRecovery = structure && record.noticeShortfallDays ? (structure.grossMonthly / 22) * record.noticeShortfallDays : 0;
  const suggestions = {
    leaveBalanceDays: Math.round(leaveDays * 100) / 100,
    leaveEncashmentAmount: Math.round(encashableDays * perDay * 100) / 100,
    noticePeriodRecovery: Math.round(noticeRecovery * 100) / 100,
    assetsPending: assets.length,
    pendingTasks,
  };
  return respond.ok(res, { balances, suggestions, structure, assets });
}));

/* ── FINAL SETTLEMENT ────────────────────────────────────────────── */
router.post('/:id/final-settlement', requirePermission('payroll:update', 'offboarding:update'), validate({ body: z.object({
  lines: z.array(z.object({ name: z.string(), type: z.enum(['earning', 'deduction']), amount: z.coerce.number() })),
  notes: z.string().optional(), approve: z.boolean().optional(),
}) }), asyncHandler(async (req, res) => {
  const record = await Offboarding.findById(req.params.id).populate('employee');
  if (!record) throw ApiError.notFound('Offboarding record not found');
  const earnings = req.body.lines.filter((l) => l.type === 'earning').reduce((s, l) => s + l.amount, 0);
  const deductions = req.body.lines.filter((l) => l.type === 'deduction').reduce((s, l) => s + l.amount, 0);
  record.finalSettlement = {
    status: req.body.approve ? 'approved' : 'calculated', lines: req.body.lines,
    netAmount: Math.round((earnings - deductions) * 100) / 100,
    calculatedBy: req.user._id, calculatedAt: new Date(),
    approvedBy: req.body.approve ? req.user._id : undefined, approvedAt: req.body.approve ? new Date() : undefined,
  };
  record.reconciliation = { ...(record.reconciliation?.toObject?.() ?? record.reconciliation), totalSettlement: record.finalSettlement.netAmount, notes: req.body.notes };
  record.auditTrail.push({ by: req.user._id, action: 'final_settlement', note: `Net settlement ${record.finalSettlement.netAmount}` });
  await record.save();
  await recordAudit(req, { action: 'offboarding.final_settlement', module: 'offboarding', targetId: record._id, description: `Final settlement for ${record.employee.fullName}: net ${record.finalSettlement.netAmount}`, severity: 'critical' });
  return respond.ok(res, record.finalSettlement, 'Final settlement saved');
}));

/* ── LETTERS (PDF) ───────────────────────────────────────────────── */
router.get('/:id/letters/:type', requirePermission('offboarding:view', 'documents:view'), asyncHandler(async (req, res) => {
  const type = req.params.type;
  if (!['experience', 'relieving', 'settlement'].includes(type)) throw ApiError.badRequest('Letter type must be experience, relieving or settlement');
  const record = await Offboarding.findById(req.params.id).populate({ path: 'employee', populate: [{ path: 'department', select: 'name' }, { path: 'designation', select: 'title' }] });
  if (!record) throw ApiError.notFound('Offboarding record not found');
  const settings = await CompanySettings.findOne({ singleton: 'company' }) || {};
  const emp = record.employee;
  const isSelf = String(emp._id) === String(req.scope.selfEmployeeId);
  if (!req.scope.isGlobal && !isSelf) throw ApiError.forbidden('Not authorised');
  await recordAudit(req, { action: `offboarding.letter_${type}`, module: 'documents', targetId: record._id, description: `${type} letter generated for ${emp.fullName}`, severity: 'warning' });

  streamPDF(res, `${type}-letter-${emp.employeeId}.pdf`, (doc) => {
    header(doc, { company: settings.name || 'Company', subtitle: `${settings.address?.line1 || ''}, ${settings.address?.city || ''} — ${settings.address?.pincode || ''}`, title: type === 'settlement' ? 'Full & Final Settlement Statement' : `${type === 'experience' ? 'Experience' : 'Relieving'} Certificate` });
    doc.fontSize(10).fillColor('#111827');
    doc.text(`Ref: ${emp.employeeId}/${type.toUpperCase()}/${new Date().getFullYear()}`);
    doc.text(`Date: ${new Date().toDateString()}`);
    doc.moveDown(0.8);
    if (type === 'settlement') {
      doc.text(`Name: ${emp.firstName} ${emp.lastName}   |   Employee ID: ${emp.employeeId}`);
      doc.text(`Last Working Day: ${new Date(record.lastWorkingDay).toDateString()}`);
      doc.moveDown(0.8);
      const rows = [['Particulars', 'Type', 'Amount (INR)']];
      (record.finalSettlement?.lines || []).forEach((l) => rows.push([l.name, l.type, Number(l.amount).toFixed(2)]));
      rows.push(['NET SETTLEMENT', '', Number(record.finalSettlement?.netAmount || 0).toFixed(2)]);
      table(doc, rows, { colWidths: [280, 110, 109] });
    } else {
      doc.text(`To Whomsoever It May Concern`, { align: 'center' });
      doc.moveDown(0.8);
      doc.text(`${type === 'experience' ? 'This is to certify that' : 'This is to certify that'} ${emp.firstName} ${emp.lastName} (Employee ID: ${emp.employeeId}) was employed with ${settings.name || 'our organisation'} as ${emp.designation?.title || 'an employee'} in the ${emp.department?.name || ''} department from ${new Date(emp.joiningDate).toDateString()} to ${new Date(record.lastWorkingDay).toDateString()}.`, { align: 'justify' });
      doc.moveDown(0.5);
      if (type === 'experience') doc.text(`During the tenure, their conduct and performance were found satisfactory. We wish them continued success in future endeavours.`, { align: 'justify' });
      else doc.text(`All company dues have been settled and they are relieved of all duties effective ${new Date(record.lastWorkingDay).toDateString()}. We wish them the very best in their future assignments.`, { align: 'justify' });
      doc.moveDown(2);
      doc.font('Helvetica-Bold').text('For ' + (settings.name || 'Company'));
      doc.moveDown(1.5).font('Helvetica').text('Authorised Signatory — Human Resources');
    }
    doc.moveDown(2).fontSize(8).fillColor('#9ca3af').text('This is a computer-generated document.', { align: 'center' });
  }, { title: `${type} letter` });
}));

/* ── COMPLETE / ARCHIVE ──────────────────────────────────────────── */
router.post('/:id/complete', requirePermission('offboarding:update', 'offboarding:approve'), asyncHandler(async (req, res) => {
  const record = await Offboarding.findById(req.params.id).populate('employee');
  if (!record) throw ApiError.notFound('Offboarding record not found');
  const pendingTasks = record.tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
  if (pendingTasks.length && req.body?.force !== true) throw ApiError.badRequest(`${pendingTasks.length} checklist item(s) pending. Complete them or pass force=true.`);
  const pendingAssets = await AssetAssignment.countDocuments({ employee: record.employee._id, status: 'assigned' });
  if (pendingAssets && req.body?.force !== true) throw ApiError.badRequest(`${pendingAssets} asset(s) not yet returned`);

  record.status = 'completed';
  record.auditTrail.push({ by: req.user._id, action: 'completed', note: 'Offboarding completed; employee archived' });
  await record.save();

  // Archive employee — keeps attendance/leave/payroll history intact
  const emp = await Employee.findById(record.employee._id);
  emp.employmentStatus = req.body.exitType === 'terminated' ? 'terminated' : 'resigned';
  emp.isActive = false;
  emp.exitReason = record.reason;
  emp.exitFeedback = record.exitInterview?.feedback;
  emp.lastWorkingDay = record.lastWorkingDay;
  emp.history.push({ by: req.user._id, action: 'offboarded', note: `Offboarding completed (${record.reason}); records archived` });
  await emp.save();
  if (emp.user) { await User.findByIdAndUpdate(emp.user, { isActive: false }); await RefreshToken.updateMany({ user: emp.user, revokedAt: null }, { revokedAt: new Date() }); }
  await recordAudit(req, { action: 'offboarding.complete', module: 'offboarding', targetId: record._id, description: `Offboarding completed for ${record.employee.fullName}; employee archived (attendance, leave and payroll history preserved)`, severity: 'critical' });
  return respond.ok(res, record, 'Offboarding completed and employee archived');
}));

module.exports = router;
