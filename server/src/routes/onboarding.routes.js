'use strict';
const express = require('express');
const { z } = require('zod');
const { Onboarding, OnboardingTemplate, Employee, Asset, CompanySettings } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const validate = require('../middleware/validate');
const { requirePermission } = require('../middleware/auth');
const { buildQuery, paginate } = require('../utils/query');
const { recordAudit } = require('../utils/audit');
const { notify } = require('../utils/notify');

const router = express.Router();
const POPULATE = [{ path: 'employee', select: 'firstName lastName employeeId joiningDate department designation profilePhoto email' }];

/* ── TEMPLATES ────────────────────────────────────────────────────── */
router.get('/templates', requirePermission('onboarding:view'), asyncHandler(async (req, res) => {
  const items = await OnboardingTemplate.find().populate('department designation', 'name title').sort('name').lean();
  return respond.list(res, items, { total: items.length });
}));

router.post('/templates', requirePermission('onboarding:create', 'settings:create', 'onboarding:update'), validate({ body: z.object({
  name: z.string().min(2), description: z.string().optional(), department: z.string().optional().nullable(),
  designation: z.string().optional().nullable(), isDefault: z.boolean().optional(),
  tasks: z.array(z.object({ title: z.string(), description: z.string().optional(), category: z.string().optional(), ownerRole: z.string().optional(), dueAfterDays: z.coerce.number().optional(), order: z.coerce.number().optional() })).optional(),
  documentsRequired: z.array(z.object({ title: z.string(), category: z.string().optional(), mandatory: z.boolean().optional() })).optional(),
}) }), asyncHandler(async (req, res) => {
  const tpl = await OnboardingTemplate.create({ ...req.body, createdBy: req.user._id });
  await recordAudit(req, { action: 'onboarding.template_create', module: 'onboarding', targetId: tpl._id, description: `Created onboarding template "${tpl.name}"` });
  return respond.created(res, tpl, 'Onboarding template created');
}));

router.patch('/templates/:id', requirePermission('onboarding:update'), asyncHandler(async (req, res) => {
  const tpl = await OnboardingTemplate.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!tpl) throw ApiError.notFound('Template not found');
  return respond.ok(res, tpl, 'Template updated');
}));

router.delete('/templates/:id', requirePermission('onboarding:delete', 'onboarding:update'), asyncHandler(async (req, res) => {
  const used = await Onboarding.countDocuments({ template: req.params.id });
  if (used) throw ApiError.conflict(`${used} onboarding record(s) use this template. Deactivate it instead of deleting.`);
  await OnboardingTemplate.findByIdAndDelete(req.params.id);
  return respond.ok(res, { _id: req.params.id }, 'Template deleted');
}));

/* ── ONBOARDING RECORDS ───────────────────────────────────────────── */
router.get('/', requirePermission('onboarding:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: [], filterFields: ['status'], defaultSort: '-createdAt' });
  const { items, meta } = await paginate(Onboarding, opts, { populate: POPULATE });
  if (req.query.department) {
    const ids = await Employee.distinct('_id', { department: req.query.department });
    return respond.list(res, items.filter((i) => ids.map(String).includes(String(i.employee?._id))), meta);
  }
  return respond.list(res, items, meta);
}));

router.get('/:id', requirePermission('onboarding:view'), asyncHandler(async (req, res) => {
  const record = await Onboarding.findById(req.params.id).populate(POPULATE).populate('template').populate('tasks.assignedTo', 'name').populate('buddy managerOwner', 'firstName lastName employeeId').populate('assets.asset', 'assetId name category').lean();
  if (!record) throw ApiError.notFound('Onboarding record not found');
  const isSelf = String(record.employee?._id) === String(req.scope.selfEmployeeId);
  if (!req.scope.isGlobal && !isSelf && req.user.role !== 'department_manager' && req.user.role !== 'team_leader') throw ApiError.forbidden('Not authorised');
  return respond.ok(res, record);
}));

/** Start onboarding for an employee (optionally from a template). */
router.post('/', requirePermission('onboarding:create', 'onboarding:update'), validate({ body: z.object({
  employeeId: z.string(), templateId: z.string().optional(), startDate: z.coerce.date().optional(),
  targetCompletionDate: z.coerce.date().optional(), buddy: z.string().optional().nullable(),
}) }), asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.body.employeeId);
  if (!employee) throw ApiError.notFound('Employee not found');
  const existing = await Onboarding.findOne({ employee: employee._id, status: { $ne: 'cancelled' } });
  if (existing) throw ApiError.conflict('An onboarding process already exists for this employee');

  let tpl = null;
  if (req.body.templateId) tpl = await OnboardingTemplate.findById(req.body.templateId);
  if (!tpl) tpl = await OnboardingTemplate.findOne({ $or: [{ department: employee.department }, { designation: employee.designation }, { isDefault: true }] }).sort('isDefault -1');

  const startDate = req.body.startDate || employee.joiningDate;
  const record = await Onboarding.create({
    employee: employee._id, template: tpl?._id, status: 'in_progress', startDate,
    targetCompletionDate: req.body.targetCompletionDate || new Date(new Date(startDate).getTime() + 30 * 86400000),
    tasks: (tpl?.tasks || []).map((t, i) => ({ ...t, dueDate: new Date(new Date(startDate).getTime() + (t.dueAfterDays || 1) * 86400000), order: t.order ?? i })),
    documents: (tpl?.documentsRequired || []).map((d) => ({ title: d.title, category: d.category, status: 'pending' })),
    buddy: req.body.buddy || null, hrOwner: req.user._id, managerOwner: employee.reportingManager,
    agreements: [
      { title: 'Offer Letter', type: 'offer_letter' },
      { title: 'Appointment Letter', type: 'appointment_letter' },
      { title: 'Code of Conduct Acknowledgement', type: 'policy_acknowledgement' },
    ],
    orientation: [
      { title: 'Company introduction & culture', scheduledAt: startDate, durationMinutes: 60, presenter: 'HR' },
      { title: 'Team introduction', scheduledAt: new Date(new Date(startDate).getTime() + 86400000), durationMinutes: 30, presenter: 'Reporting Manager' },
      { title: 'Tools & systems walkthrough', scheduledAt: new Date(new Date(startDate).getTime() + 86400000), durationMinutes: 45, presenter: 'IT / Buddy' },
    ],
    auditTrail: [{ by: req.user._id, action: 'started', note: tpl ? `Started from template "${tpl.name}"` : 'Started without template' }],
  });
  await notify({ userId: employee.user, title: 'Welcome! Complete your onboarding', body: `${(tpl?.tasks || []).length} onboarding tasks are assigned to you.`, type: 'onboarding', link: `/onboarding/${record._id}` });
  await recordAudit(req, { action: 'onboarding.start', module: 'onboarding', targetId: record._id, description: `Onboarding started for ${employee.fullName}` });
  return respond.created(res, record, 'Onboarding started');
}));

/** Update a task's status (HR, manager or the employee themself). */
router.patch('/:id/tasks/:taskId', requirePermission('onboarding:update'), asyncHandler(async (req, res) => {
  const record = await Onboarding.findById(req.params.id).populate('employee', 'firstName lastName userId');
  if (!record) throw ApiError.notFound('Onboarding record not found');
  const task = record.tasks.id(req.params.taskId);
  if (!task) throw ApiError.notFound('Task not found');
  const isSelf = String(record.employee._id) === String(req.scope.selfEmployeeId);
  if (!req.scope.isGlobal && !isSelf) throw ApiError.forbidden('Not authorised to update this task');
  const { status, remarks, documentUrl, dueDate } = req.body;
  if (status) { task.status = status; if (status === 'completed') { task.completedAt = new Date(); task.completedBy = req.user._id; } }
  if (remarks !== undefined) task.remarks = remarks;
  if (documentUrl !== undefined) task.documentUrl = documentUrl;
  if (dueDate) task.dueDate = dueDate;
  record.auditTrail.push({ by: req.user._id, action: 'task_updated', note: `${task.title} → ${task.status}` });
  await record.save();
  return respond.ok(res, record, 'Task updated');
}));

router.post('/:id/documents/:docId', requirePermission('onboarding:update'), asyncHandler(async (req, res) => {
  const record = await Onboarding.findById(req.params.id);
  const doc = record?.documents.id(req.params.docId);
  if (!record || !doc) throw ApiError.notFound('Document item not found');
  const isSelf = String(record.employee) === String(req.scope.selfEmployeeId);
  if (!req.scope.isGlobal && !isSelf && !req.user.role.includes('hr')) throw ApiError.forbidden('Not authorised');
  Object.assign(doc, { ...req.body, status: req.body.url ? 'submitted' : doc.status });
  await record.save();
  return respond.ok(res, doc, 'Document updated');
}));

router.post('/:id/documents/:docId/verify', requirePermission('onboarding:update', 'documents:update'), asyncHandler(async (req, res) => {
  const record = await Onboarding.findById(req.params.id);
  const doc = record?.documents.id(req.params.docId);
  if (!record || !doc) throw ApiError.notFound('Document item not found');
  doc.status = req.body.status === 'rejected' ? 'rejected' : 'verified';
  doc.verifiedBy = req.user._id; doc.verifiedAt = new Date(); doc.remarks = req.body.remarks;
  await record.save();
  await recordAudit(req, { action: 'onboarding.document_verify', module: 'onboarding', targetId: record._id, description: `Document "${doc.title}" ${doc.status} for employee ${record.employee}`, severity: 'warning' });
  return respond.ok(res, doc, `Document ${doc.status}`);
}));

router.post('/:id/agreements/:agreementId/acknowledge', requirePermission('onboarding:view'), asyncHandler(async (req, res) => {
  const record = await Onboarding.findById(req.params.id);
  const agreement = record?.agreements.id(req.params.agreementId);
  if (!record || !agreement) throw ApiError.notFound('Agreement not found');
  if (String(record.employee) !== String(req.scope.selfEmployeeId) && !req.scope.isGlobal) throw ApiError.forbidden('You can only acknowledge your own agreements');
  agreement.acknowledged = true; agreement.acknowledgedAt = new Date(); agreement.ip = req.ip;
  await record.save();
  return respond.ok(res, agreement, 'Agreement acknowledged');
}));

router.post('/:id/assets', requirePermission('onboarding:update', 'assets:update'), asyncHandler(async (req, res) => {
  const [{ AssetAssignment }, ] = [require('../models')];
  const record = await Onboarding.findById(req.params.id);
  if (!record) throw ApiError.notFound('Onboarding record not found');
  const asset = await Asset.findById(req.body.assetId);
  if (!asset) throw ApiError.notFound('Asset not found');
  if (asset.status === 'assigned' && String(asset.currentHolder) !== String(record.employee)) throw ApiError.conflict('This asset is already assigned to someone else');
  asset.status = 'assigned'; asset.currentHolder = record.employee; asset.assignedAt = new Date();
  await asset.save();
  await AssetAssignment.create({ asset: asset._id, employee: record.employee, assignedBy: req.user._id, conditionAtAssignment: asset.condition, status: 'assigned' });
  record.assets.push({ asset: asset._id, assignedAt: new Date(), note: req.body.note });
  await record.save();
  return respond.ok(res, record.assets[record.assets.length - 1], 'Asset assigned to new joiner');
}));

router.post('/:id/complete', requirePermission('onboarding:update', 'onboarding:approve'), asyncHandler(async (req, res) => {
  const record = await Onboarding.findById(req.params.id);
  if (!record) throw ApiError.notFound('Onboarding record not found');
  const pending = record.tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
  if (pending.length && req.body?.force !== true) throw ApiError.badRequest(`${pending.length} task(s) still pending. Complete them or pass force=true to override.`);
  record.status = 'completed'; record.completedAt = new Date(); record.progressPercent = 100;
  if (req.body?.confirmationDate) {
    await Employee.findByIdAndUpdate(record.employee, { employmentStatus: 'active', employeeCategory: 'permanent', confirmationDate: req.body.confirmationDate });
  }
  record.auditTrail.push({ by: req.user._id, action: 'completed', note: req.body?.note });
  await record.save();
  await recordAudit(req, { action: 'onboarding.complete', module: 'onboarding', targetId: record._id, description: `Onboarding completed for employee ${record.employee}` });
  return respond.ok(res, record, 'Onboarding marked complete');
}));

module.exports = router;
