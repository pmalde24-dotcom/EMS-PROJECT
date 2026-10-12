'use strict';
const express = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const { PerformanceReview, PerformanceTemplate, Goal, PerformancePlan, Employee, Designation } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const validate = require('../middleware/validate');
const { requirePermission, scopeFilter, directReportIds, assertCanActOnEmployee } = require('../middleware/auth');
const { buildQuery, paginate } = require('../utils/query');
const { recordAudit } = require('../utils/audit');
const { sendCSV } = require('../utils/csv');
const { notify } = require('../utils/notify');

const router = express.Router();
const POPULATE = [
  { path: 'employee', select: 'firstName lastName employeeId department designation profilePhoto' },
  { path: 'reviewer', select: 'firstName lastName employeeId' },
  { path: 'hrReviewer', select: 'firstName lastName employeeId' },
];

const ratingSchema = z.array(z.object({ competency: z.string().optional(), name: z.string().optional(), rating: z.coerce.number().min(1).max(5), weight: z.coerce.number().optional(), comment: z.string().optional() }));

/* ── TEMPLATES ────────────────────────────────────────────────────── */
router.get('/templates', requirePermission('performance:view'), asyncHandler(async (req, res) => {
  const items = await PerformanceTemplate.find({ isActive: true }).lean();
  return respond.list(res, items, { total: items.length });
}));

router.post('/templates', requirePermission('performance:create', 'settings:create'), validate({ body: z.object({
  name: z.string().min(2), cycleType: z.enum(['quarterly', 'half_yearly', 'annual', 'probation', 'special']).optional(),
  description: z.string().optional(),
  competencies: z.array(z.object({ name: z.string(), description: z.string().optional(), weight: z.coerce.number().optional() })).optional(),
  ratingScale: z.object({ min: z.coerce.number().optional(), max: z.coerce.number().optional(), labels: z.array(z.string()).optional() }).optional(),
  includeSelfAssessment: z.boolean().optional(), includeManagerAssessment: z.boolean().optional(), includeHRReview: z.boolean().optional(), isDefault: z.boolean().optional(),
}) }), asyncHandler(async (req, res) => {
  const tpl = await PerformanceTemplate.create({ ...req.body, createdBy: req.user._id });
  return respond.created(res, tpl, 'Review template created');
}));

/* ── REVIEWS ──────────────────────────────────────────────────────── */
router.get('/reviews', requirePermission('performance:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: ['cycle'], filterFields: ['cycle', 'status', 'employee', 'cycleType'], defaultSort: '-createdAt' });
  delete opts.filter.employee;
  Object.assign(opts.filter, await scopeFilter(req, 'employee'));
  if (req.query.employee && req.scope.isGlobal) opts.filter.employee = req.query.employee;
  if (req.query.mine === 'true') opts.filter.employee = req.scope.selfEmployeeId;
  const { items, meta } = await paginate(PerformanceReview, opts, { populate: POPULATE });
  const visible = items.filter((r) => {
    if (r.status === 'released') return true;
    return req.scope.isGlobal || String(r.employee?._id) === String(req.scope.selfEmployeeId) || req.user.role === 'department_manager' || req.user.role === 'team_leader';
  });
  return respond.list(res, visible, meta);
}));

router.get('/reviews/:id', requirePermission('performance:view'), asyncHandler(async (req, res) => {
  const review = await PerformanceReview.findById(req.params.id).populate(POPULATE).populate('template').lean();
  if (!review) throw ApiError.notFound('Review not found');
  const isSelf = String(review.employee?._id) === String(req.scope.selfEmployeeId);
  const isReviewer = String(review.reviewer) === String(req.scope.selfEmployeeId);
  const privileged = req.scope.isGlobal || isReviewer || req.user.role === 'department_manager' || req.user.role === 'team_leader';
  if (!privileged && !isSelf) throw ApiError.forbidden('Not authorised to view this review');
  if (isSelf && !privileged && !['released', 'self_pending'].includes(review.status)) throw ApiError.forbidden('This review has not been released yet');
  return respond.ok(res, review);
}));

/** HR starts review cycles for a set of employees. */
router.post('/reviews/bulk-create', requirePermission('performance:create', 'performance:update'), validate({ body: z.object({
  cycle: z.string().min(2), cycleType: z.enum(['quarterly', 'half_yearly', 'annual', 'probation', 'special']).optional(),
  periodStart: z.coerce.date().optional(), periodEnd: z.coerce.date().optional(), templateId: z.string().optional(),
  department: z.string().optional(), employeeIds: z.array(z.string()).optional(), dueDate: z.coerce.date().optional(),
}) }), asyncHandler(async (req, res) => {
  const filter = { deletedAt: null, isActive: true, employmentStatus: { $nin: ['terminated', 'resigned', 'retired'] } };
  if (req.body.department) filter.department = req.body.department;
  if (req.body.employeeIds?.length) filter._id = { $in: req.body.employeeIds };
  const employees = await Employee.find(filter).select('_id reportingManager user firstName').lean();
  const tpl = req.body.templateId ? await PerformanceTemplate.findById(req.body.templateId) : await PerformanceTemplate.findOne({ isDefault: true });
  let created = 0, skipped = 0;
  for (const emp of employees) {
    const exists = await PerformanceReview.findOne({ employee: emp._id, cycle: req.body.cycle });
    if (exists) { skipped++; continue; }
    await PerformanceReview.create({
      employee: emp._id, cycle: req.body.cycle, cycleType: req.body.cycleType || 'annual',
      periodStart: req.body.periodStart, periodEnd: req.body.periodEnd, template: tpl?._id,
      reviewer: emp.reportingManager, ratingScale: tpl?.ratingScale || undefined,
      status: tpl?.includeSelfAssessment === false ? 'manager_pending' : 'self_pending',
      auditTrail: [{ by: req.user._id, action: 'created', note: `Review cycle ${req.body.cycle} initiated` }],
    });
    created++;
    await notify({ userId: emp.user, title: 'Performance review started', body: `Your self-assessment for ${req.body.cycle} is due${req.body.dueDate ? ` by ${new Date(req.body.dueDate).toDateString()}` : ''}.`, type: 'performance', link: '/performance/my-reviews', sendEmail: true });
  }
  await recordAudit(req, { action: 'performance.bulk_create', module: 'performance', description: `Created ${created} review(s) for cycle ${req.body.cycle} (${skipped} already existed)`, severity: 'warning' });
  return respond.created(res, { created, skipped }, `${created} review(s) created`);
}));

/** Employee self-assessment. */
router.post('/reviews/:id/self-assessment', requirePermission('performance:view'), validate({ body: z.object({
  ratings: ratingSchema.optional(), comments: z.string().optional(), achievements: z.string().optional(),
  challenges: z.string().optional(), overallSelfRating: z.coerce.number().min(1).max(5).optional(), goalsReview: z.string().optional(),
}) }), asyncHandler(async (req, res) => {
  const review = await PerformanceReview.findById(req.params.id);
  if (!review) throw ApiError.notFound('Review not found');
  if (String(review.employee) !== String(req.scope.selfEmployeeId)) throw ApiError.forbidden('You can only submit your own self-assessment');
  if (review.selfAssessment.submitted) throw ApiError.conflict('Self-assessment already submitted');
  if (!['self_pending', 'draft'].includes(review.status)) throw ApiError.badRequest(`Review is in "${review.status}" state`);
  review.selfAssessment = { ...req.body, submitted: true, submittedAt: new Date() };
  review.status = 'manager_pending';
  review.auditTrail.push({ by: req.user._id, action: 'self_assessment', note: 'Self-assessment submitted' });
  await review.save();
  if (review.reviewer) {
    const mgr = await Employee.findById(review.reviewer).select('user').lean();
    await notify({ userId: mgr?.user, title: 'Performance review pending your assessment', body: `A self-assessment for cycle ${review.cycle} is ready for your review.`, type: 'performance', link: `/performance/reviews/${review._id}`, sendEmail: true });
  }
  return respond.ok(res, review, 'Self-assessment submitted');
}));

/** Manager assessment. */
router.post('/reviews/:id/manager-assessment', requirePermission('performance:update', 'performance:approve'), validate({ body: z.object({
  ratings: ratingSchema.optional(), comments: z.string().optional(), strengths: z.string().optional(), improvements: z.string().optional(),
  overallRating: z.coerce.number().min(1).max(5), promotionRecommended: z.boolean().optional(),
  recommendedDesignation: z.string().optional().nullable(), incrementRecommended: z.coerce.number().optional(),
}) }), asyncHandler(async (req, res) => {
  const review = await PerformanceReview.findById(req.params.id);
  if (!review) throw ApiError.notFound('Review not found');
  if (!req.scope.isGlobal) {
    const ids = [req.scope.selfEmployeeId, ...(await directReportIds(req.scope.selfEmployeeId))].map(String);
    if (!ids.includes(String(review.employee))) throw ApiError.forbidden('This employee is not in your team');
  }
  review.managerAssessment = { ...req.body, submitted: true, submittedAt: new Date() };
  if (req.body.recommendedDesignation) {
    const desig = await Designation.findById(req.body.recommendedDesignation);
    if (!desig) throw ApiError.badRequest('Recommended designation not found');
  }
  review.status = 'hr_pending';
  review.promotionEligible = !!req.body.promotionRecommended;
  review.hikePercent = req.body.incrementRecommended;
  review.auditTrail.push({ by: req.user._id, action: 'manager_assessment', note: `Manager rating ${req.body.overallRating}` });
  await review.save();
  const { User } = require('../models');
  const hr = await User.findOne({ role: 'hr_admin', isActive: true }).select('_id').lean();
  await notify({ userId: hr?._id, title: 'Performance review awaiting HR review', body: `Manager assessment submitted for cycle ${review.cycle}.`, type: 'performance', link: `/performance/reviews/${review._id}`, sendEmail: true });
  return respond.ok(res, review, 'Manager assessment submitted');
}));

/** HR review / calibration / release. */
router.post('/reviews/:id/hr-review', requirePermission('performance:approve', 'performance:update'), validate({ body: z.object({
  comments: z.string().optional(), finalRating: z.coerce.number().min(1).max(5).optional(),
  calibratedRating: z.coerce.number().min(1).max(5).optional(), release: z.boolean().optional(), hikePercent: z.coerce.number().optional(),
}) }), asyncHandler(async (req, res) => {
  const review = await PerformanceReview.findById(req.params.id).populate('employee', 'firstName lastName user');
  if (!review) throw ApiError.notFound('Review not found');
  review.hrAssessment = { submitted: true, submittedAt: new Date(), comments: req.body.comments, finalRating: req.body.finalRating, approved: !!req.body.release, calibratedRating: req.body.calibratedRating };
  review.finalRating = req.body.calibratedRating ?? req.body.finalRating ?? review.managerAssessment?.overallRating;
  review.finalComments = req.body.comments;
  if (req.body.hikePercent !== undefined) review.hikePercent = req.body.hikePercent;
  if (req.body.release) { review.status = 'released'; review.releasedAt = new Date(); }
  else review.status = 'completed';
  review.auditTrail.push({ by: req.user._id, action: req.body.release ? 'released' : 'hr_reviewed', note: `Final rating ${review.finalRating}` });
  await review.save();
  await notify({ userId: review.employee.user, title: req.body.release ? 'Your performance review is released' : 'Performance review completed', body: `Cycle ${review.cycle}: final rating ${review.finalRating}/5.`, type: 'performance', link: '/performance/my-reviews', sendEmail: true });
  await recordAudit(req, { action: 'performance.hr_review', module: 'performance', targetId: review._id, description: `HR review for ${review.employee.firstName} ${review.employee.lastName} — rating ${review.finalRating}${req.body.release ? ' (released)' : ''}`, severity: 'warning' });
  return respond.ok(res, review, req.body.release ? 'Review released to employee' : 'HR review saved');
}));

/* ── GOALS / OKRs ─────────────────────────────────────────────────── */
router.get('/goals', requirePermission('performance:view'), asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.period) filter.period = req.query.period;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.status) filter.status = req.query.status;
  if (!req.scope.isGlobal || req.query.mine === 'true') filter.employee = req.scope.selfEmployeeId;
  else if (req.query.employee) filter.employee = req.query.employee;
  if (req.query.team === 'true' && !req.scope.isGlobal) filter.employee = { $in: [req.scope.selfEmployeeId, ...(await directReportIds(req.scope.selfEmployeeId))] };
  const items = await Goal.find(filter).populate('employee', 'firstName lastName employeeId profilePhoto').sort('-createdAt').lean();
  return respond.list(res, items, { total: items.length });
}));

router.post('/goals', requirePermission('performance:create', 'performance:update'), validate({ body: z.object({
  employee: z.string().optional(), title: z.string().min(3), description: z.string().optional(),
  type: z.enum(['okr', 'kpi', 'individual', 'team', 'development']).optional(),
  category: z.enum(['business', 'technical', 'leadership', 'customer', 'process', 'learning', 'other']).optional(),
  period: z.string().optional(), startDate: z.coerce.date().optional(), dueDate: z.coerce.date().optional(),
  keyResults: z.array(z.object({ title: z.string(), target: z.coerce.number(), current: z.coerce.number().optional(), unit: z.string().optional() })).optional(),
  weight: z.coerce.number().optional(), priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
}) }), asyncHandler(async (req, res) => {
  let employeeId = req.body.employee;
  if (!employeeId) employeeId = req.scope.selfEmployeeId;
  if (!employeeId) throw ApiError.badRequest('employee is required');
  if (!req.scope.isGlobal && String(employeeId) !== String(req.scope.selfEmployeeId)) {
    const ids = [req.scope.selfEmployeeId, ...(await directReportIds(req.scope.selfEmployeeId))].map(String);
    if (!ids.includes(String(employeeId))) throw ApiError.forbidden('You can only set goals for yourself or your team');
  }
  const goal = await Goal.create({ ...req.body, employee: employeeId, createdBy: req.user._id, auditTrail: [{ by: req.user._id, action: 'created' }] });
  const emp = await Employee.findById(employeeId).select('user firstName').lean();
  await notify({ userId: emp?.user, title: 'New goal assigned', body: `"${goal.title}"${goal.dueDate ? ` — due ${new Date(goal.dueDate).toDateString()}` : ''}`, type: 'performance', link: '/performance/goals' });
  return respond.created(res, goal, 'Goal created');
}));

router.patch('/goals/:id', requirePermission('performance:update', 'performance:view'), asyncHandler(async (req, res) => {
  const goal = await Goal.findById(req.params.id);
  if (!goal) throw ApiError.notFound('Goal not found');
  const isOwner = String(goal.employee) === String(req.scope.selfEmployeeId);
  if (!req.scope.isGlobal && !isOwner && !['department_manager', 'team_leader'].includes(req.user.role)) throw ApiError.forbidden('Not authorised to update this goal');
  if (isOwner && !req.scope.isGlobal) {
    const allowed = ['progressPercent', 'status', 'employeeComments', 'keyResults'];
    Object.keys(req.body).forEach((k) => { if (!allowed.includes(k)) delete req.body[k]; });
  }
  Object.assign(goal, req.body);
  if (req.body.status === 'achieved') goal.completedAt = new Date();
  goal.auditTrail.push({ by: req.user._id, action: 'updated', note: req.body.note });
  await goal.save();
  return respond.ok(res, goal, 'Goal updated');
}));

router.delete('/goals/:id', requirePermission('performance:delete', 'performance:update'), asyncHandler(async (req, res) => {
  const goal = await Goal.findById(req.params.id);
  if (!goal) throw ApiError.notFound('Goal not found');
  if (!req.scope.isGlobal && String(goal.createdBy) !== String(req.user._id) && String(goal.employee) !== String(req.scope.selfEmployeeId)) throw ApiError.forbidden('Not authorised');
  await goal.deleteOne();
  return respond.ok(res, { _id: req.params.id }, 'Goal deleted');
}));

/* ── PERFORMANCE IMPROVEMENT PLANS ───────────────────────────────── */
router.get('/plans', requirePermission('performance:view'), asyncHandler(async (req, res) => {
  const filter = {};
  if (!req.scope.isGlobal) filter.employee = req.query.team === 'true' ? { $in: [req.scope.selfEmployeeId, ...(await directReportIds(req.scope.selfEmployeeId))] } : req.scope.selfEmployeeId;
  const items = await PerformancePlan.find(filter).populate('employee mentor', 'firstName lastName employeeId').lean();
  return respond.list(res, items, { total: items.length });
}));

router.post('/plans', requirePermission('performance:update', 'performance:create'), validate({ body: z.object({
  employee: z.string(), review: z.string().optional(), type: z.enum(['improvement_plan', 'development_plan', 'probation_extension']).optional(),
  title: z.string().optional(), reason: z.string().min(5), startDate: z.coerce.date(), endDate: z.coerce.date(),
  objectives: z.array(z.object({ title: z.string(), successCriteria: z.string().optional() })).optional(),
  mentor: z.string().optional().nullable(), reviewDates: z.array(z.coerce.date()).optional(),
}) }), asyncHandler(async (req, res) => {
  if (!req.scope.isGlobal) await assertCanActOnEmployee(req, req.body.employee);
  const plan = await PerformancePlan.create({ ...req.body, hrOwner: req.scope.selfEmployeeId });
  const emp = await Employee.findById(req.body.employee).select('user').lean();
  await notify({ userId: emp?.user, title: 'Performance plan created', body: `A ${String(plan.type).replace(/_/g, ' ')} has been created for you: ${plan.reason}`, type: 'performance', link: '/performance/plans', sendEmail: true });
  await recordAudit(req, { action: 'performance.plan_create', module: 'performance', targetId: plan._id, description: `Created ${plan.type} for employee ${req.body.employee}`, severity: 'warning' });
  return respond.created(res, plan, 'Performance plan created');
}));

router.patch('/plans/:id', requirePermission('performance:update'), asyncHandler(async (req, res) => {
  const plan = await PerformancePlan.findById(req.params.id);
  if (!plan) throw ApiError.notFound('Plan not found');
  Object.assign(plan, req.body);
  await plan.save();
  return respond.ok(res, plan, 'Plan updated');
}));

/* ── REPORTS ──────────────────────────────────────────────────────── */
router.get('/reports/summary', requirePermission('performance:view', 'reports:view'), asyncHandler(async (req, res) => {
  const match = {};
  if (req.query.cycle) match.cycle = req.query.cycle;
  const [byStatus, ratingDistribution, byDepartment, promotionReady, goalsStats] = await Promise.all([
    PerformanceReview.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    PerformanceReview.aggregate([{ $match: { ...match, finalRating: { $ne: null } } }, { $group: { _id: '$finalRating', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    PerformanceReview.aggregate([
      { $match: match }, { $lookup: { from: 'employees', localField: 'employee', foreignField: '_id', as: 'e' } }, { $unwind: '$e' },
      { $group: { _id: '$e.department', avgRating: { $avg: '$finalRating' }, count: { $sum: 1 } } },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } }, { $unwind: { path: '$d', preserveNullAndEmptyArrays: true } },
      { $project: { department: { $ifNull: ['$d.name', 'Unassigned'] }, avgRating: { $round: ['$avgRating', 2] }, count: 1, _id: 0 } },
    ]),
    PerformanceReview.countDocuments({ ...match, promotionEligible: true }),
    Goal.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, avgProgress: { $avg: '$progressPercent' } } }]),
  ]);
  return respond.ok(res, { byStatus, ratingDistribution: ratingDistribution.map((r) => ({ rating: r._id, count: r.count })), byDepartment, promotionReady, goalsStats });
}));

module.exports = router;
