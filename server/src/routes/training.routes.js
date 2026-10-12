'use strict';
const express = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const { TrainingProgram, TrainingAssignment, Employee } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const validate = require('../middleware/validate');
const { requirePermission, directReportIds } = require('../middleware/auth');
const { buildQuery, paginate } = require('../utils/query');
const { recordAudit } = require('../utils/audit');
const { sendCSV } = require('../utils/csv');
const { notify, notifyMany } = require('../utils/notify');
const { nextSequence } = require('../utils/sequence');

const router = express.Router();

const programSchema = z.object({
  title: z.string().min(3), code: z.string().optional(), description: z.string().optional(),
  category: z.enum(['technical', 'soft_skills', 'leadership', 'compliance', 'safety', 'product', 'domain', 'other']).optional(),
  type: z.enum(['internal', 'external', 'online', 'self_paced', 'workshop', 'certification']).optional(),
  trainer: z.object({ name: z.string().optional(), email: z.string().optional(), organization: z.string().optional(), isInternal: z.boolean().optional(), employee: z.string().optional() }).optional(),
  durationHours: z.coerce.number().min(0).optional(), startDate: z.coerce.date().optional(), endDate: z.coerce.date().optional(),
  schedule: z.array(z.object({ date: z.coerce.date().optional(), startTime: z.string().optional(), endTime: z.string().optional(), topic: z.string().optional(), venue: z.string().optional(), mode: z.string().optional() })).optional(),
  venue: z.string().optional(), meetingLink: z.string().optional(),
  maxParticipants: z.coerce.number().optional(), costPerParticipant: z.coerce.number().optional(),
  skillsCovered: z.array(z.string()).optional(), certificateProvided: z.boolean().optional(),
  assessmentRequired: z.boolean().optional(), passingScore: z.coerce.number().optional(),
  departments: z.array(z.string()).optional(), mandatory: z.boolean().optional(),
  status: z.enum(['draft', 'scheduled', 'ongoing', 'completed', 'cancelled']).optional(),
  feedbackForm: z.array(z.object({ question: z.string(), type: z.enum(['rating', 'text', 'yes_no']).optional() })).optional(),
}).passthrough();

/* ── PROGRAMS ─────────────────────────────────────────────────────── */
router.get('/programs', requirePermission('training:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: ['title', 'code', 'description', 'skillsCovered'], filterFields: ['category', 'status', 'type', 'mandatory'], defaultSort: '-createdAt' });
  opts.filter.deletedAt = null;
  const { items, meta } = await paginate(TrainingProgram, opts, { populate: [{ path: 'departments', select: 'name' }] });
  const counts = await TrainingAssignment.aggregate([{ $match: { program: { $in: items.map((i) => i._id) } } }, { $group: { _id: '$program', enrolled: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } }]);
  const byId = counts.reduce((a, c) => ({ ...a, [c._id]: c }), {});
  const enriched = items.map((p) => ({ ...p, enrolled: byId[p._id]?.enrolled || 0, completed: byId[p._id]?.completed || 0 }));
  if (req.query.export === 'csv') return sendCSV(res, `training-programs-${Date.now()}.csv`, enriched.map((p) => ({ title: p.title, category: p.category, type: p.type, enrolled: p.enrolled, completed: p.completed, status: p.status })));
  return respond.list(res, enriched, meta);
}));

router.get('/programs/:id', requirePermission('training:view'), asyncHandler(async (req, res) => {
  const program = await TrainingProgram.findOne({ _id: req.params.id, deletedAt: null }).populate('trainer.employee', 'firstName lastName').populate('departments', 'name').lean();
  if (!program) throw ApiError.notFound('Training program not found');
  const assignments = await TrainingAssignment.find({ program: program._id }).populate('employee', 'firstName lastName employeeId department').lean();
  return respond.ok(res, { program, assignments });
}));

router.post('/programs', requirePermission('training:create'), validate({ body: programSchema }), asyncHandler(async (req, res) => {
  const code = req.body.code || `TRN${await nextSequence('training', 1000)}`;
  const program = await TrainingProgram.create({ ...req.body, code, createdBy: req.user._id });
  await recordAudit(req, { action: 'training.program_create', module: 'training', targetId: program._id, description: `Created training program "${program.title}"` });
  return respond.created(res, program, 'Training program created');
}));

router.patch('/programs/:id', requirePermission('training:update'), asyncHandler(async (req, res) => {
  const program = await TrainingProgram.findById(req.params.id);
  if (!program) throw ApiError.notFound('Program not found');
  Object.assign(program, req.body);
  await program.save();
  return respond.ok(res, program, 'Program updated');
}));

router.delete('/programs/:id', requirePermission('training:delete'), asyncHandler(async (req, res) => {
  const program = await TrainingProgram.findByIdAndUpdate(req.params.id, { deletedAt: new Date(), status: 'cancelled' }, { new: true });
  if (!program) throw ApiError.notFound('Program not found');
  await recordAudit(req, { action: 'training.program_delete', module: 'training', targetId: program._id, description: `Deleted training program "${program.title}"`, severity: 'warning' });
  return respond.ok(res, { _id: program._id }, 'Program deleted');
}));

/* ── ASSIGNMENTS ──────────────────────────────────────────────────── */
router.get('/assignments', requirePermission('training:view'), asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.program) filter.program = req.query.program;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.mine === 'true' || !req.scope.isGlobal) filter.employee = req.scope.selfEmployeeId;
  if (req.query.team === 'true' && !req.scope.isGlobal) filter.employee = { $in: [req.scope.selfEmployeeId, ...(await directReportIds(req.scope.selfEmployeeId))] };
  if (req.query.employee && req.scope.isGlobal) filter.employee = req.query.employee;
  const items = await TrainingAssignment.find(filter)
    .populate('employee', 'firstName lastName employeeId department designation')
    .populate({ path: 'program', select: 'title code category type startDate endDate durationHours certificateProvided' })
    .sort('-assignedAt').lean();
  return respond.list(res, items, { total: items.length });
}));

/** Assign a program to employees (all / department / specific). */
router.post('/programs/:id/assign', requirePermission('training:create', 'training:update'), validate({ body: z.object({
  employeeIds: z.array(z.string()).optional(), department: z.string().optional(), all: z.boolean().optional(),
  dueDate: z.coerce.date().optional(),
}) }), asyncHandler(async (req, res) => {
  const program = await TrainingProgram.findById(req.params.id);
  if (!program) throw ApiError.notFound('Program not found');
  let employees = [];
  if (req.body.all) employees = await Employee.find({ deletedAt: null, isActive: true }).select('_id user').lean();
  else if (req.body.department) employees = await Employee.find({ department: req.body.department, deletedAt: null, isActive: true }).select('_id user').lean();
  else if (req.body.employeeIds?.length) employees = await Employee.find({ _id: { $in: req.body.employeeIds } }).select('_id user').lean();
  if (!employees.length) throw ApiError.badRequest('Select at least one employee (or a department / all)');

  const results = { assigned: 0, skipped: 0 };
  for (const emp of employees) {
    const exists = await TrainingAssignment.findOne({ program: program._id, employee: emp._id });
    if (exists) { results.skipped++; continue; }
    await TrainingAssignment.create({ program: program._id, employee: emp._id, assignedBy: req.user._id, dueDate: req.body.dueDate || program.endDate, status: 'assigned' });
    results.assigned++;
  }
  await notifyMany(employees.map((e) => e.user), { title: 'Training assigned', body: `You have been enrolled in "${program.title}".`, type: 'training', link: '/training/my-trainings', sendEmail: true });
  await recordAudit(req, { action: 'training.assign', module: 'training', targetId: program._id, description: `Assigned "${program.title}" to ${results.assigned} employee(s)` });
  return respond.ok(res, results, `${results.assigned} employee(s) enrolled`);
}));

/** Update progress / attendance / completion. */
router.patch('/assignments/:id', requirePermission('training:update', 'training:view'), asyncHandler(async (req, res) => {
  const assignment = await TrainingAssignment.findById(req.params.id).populate('program employee');
  if (!assignment) throw ApiError.notFound('Assignment not found');
  const isSelf = String(assignment.employee._id) === String(req.scope.selfEmployeeId);
  if (!req.scope.isGlobal && !isSelf && !['department_manager', 'team_leader'].includes(req.user.role)) throw ApiError.forbidden('Not authorised');
  const before = assignment.status;
  Object.assign(assignment, req.body);
  if (req.body.attendedSessions) {
    const present = req.body.attendedSessions.filter((s) => s.present).length;
    assignment.attendancePercent = req.body.attendedSessions.length ? Math.round((present / req.body.attendedSessions.length) * 100) : 0;
  }
  if (req.body.result) {
    assignment.status = req.body.result === 'pass' ? 'completed' : (req.body.result === 'fail' ? 'failed' : 'in_progress');
    if (assignment.status === 'completed') {
      assignment.completedAt = new Date();
      assignment.progressPercent = 100;
      if (assignment.program?.certificateProvided) {
        assignment.certificate = { issued: true, issuedAt: new Date(), certificateNo: `CERT-${assignment.program.code || 'TRN'}-${String(assignment._id).slice(-6).toUpperCase()}`, url: `/api/training/assignments/${assignment._id}/certificate` };
      }
      if (req.body.skillsAcquired?.length) {
        await Employee.findByIdAndUpdate(assignment.employee._id, { $addToSet: { skills: { $each: req.body.skillsAcquired.map((s) => ({ name: s })) } } });
      }
    }
  }
  await assignment.save();
  if (before !== assignment.status) {
    await notify({ userId: assignment.employee.user, title: `Training ${assignment.status}`, body: `"${assignment.program.title}" is now ${assignment.status}.${assignment.certificate?.issued ? ' Your certificate is available for download.' : ''}`, type: 'training', link: '/training/my-trainings' });
  }
  return respond.ok(res, assignment, 'Assignment updated');
}));

/** Employee feedback on training. */
router.post('/assignments/:id/feedback', requirePermission('training:view'), validate({ body: z.object({
  overallRating: z.coerce.number().min(1).max(5), contentRating: z.coerce.number().optional(), trainerRating: z.coerce.number().optional(),
  comments: z.string().optional(), wouldRecommend: z.boolean().optional(), suggestions: z.string().optional(),
}) }), asyncHandler(async (req, res) => {
  const assignment = await TrainingAssignment.findById(req.params.id);
  if (!assignment) throw ApiError.notFound('Assignment not found');
  if (String(assignment.employee) !== String(req.scope.selfEmployeeId)) throw ApiError.forbidden('You can only give feedback on your own training');
  assignment.feedback = { ...req.body, submittedAt: new Date() };
  await assignment.save();
  return respond.ok(res, assignment.feedback, 'Feedback submitted — thank you!');
}));

/* ── SKILL MATRIX & REPORTS ──────────────────────────────────────── */
router.get('/reports/skill-matrix', requirePermission('training:view', 'reports:view'), asyncHandler(async (req, res) => {
  const filter = { deletedAt: null, isActive: true };
  if (req.query.department) filter.department = req.query.department;
  const employees = await Employee.find(filter).select('firstName lastName employeeId skills department designation').populate('department', 'name').populate('designation', 'title').lean();
  const skillMap = {};
  employees.forEach((e) => (e.skills || []).forEach((s) => {
    if (!skillMap[s.name]) skillMap[s.name] = { skill: s.name, employees: 0, levels: { beginner: 0, intermediate: 0, advanced: 0, expert: 0 } };
    skillMap[s.name].employees++;
    if (skillMap[s.name].levels[s.level] !== undefined) skillMap[s.name].levels[s.level]++;
  }));
  const certifications = await TrainingAssignment.find({ 'certificate.issued': true }).select('employee program').populate('employee', 'firstName lastName employeeId').populate('program', 'title').lean();
  return respond.ok(res, { skills: Object.values(skillMap).sort((a, b) => b.employees - a.employees), certifications, employees });
}));

router.get('/reports/summary', requirePermission('training:view', 'reports:view'), asyncHandler(async (req, res) => {
  const [byStatus, byCategory, completionByDept, costAgg] = await Promise.all([
    TrainingAssignment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    TrainingProgram.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$category', programs: { $sum: 1 }, hours: { $sum: '$durationHours' } } }]),
    TrainingAssignment.aggregate([
      { $lookup: { from: 'employees', localField: 'employee', foreignField: '_id', as: 'e' } }, { $unwind: '$e' },
      { $group: { _id: '$e.department', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } }, { $unwind: { path: '$d', preserveNullAndEmptyArrays: true } },
      { $project: { department: { $ifNull: ['$d.name', 'Unassigned'] }, total: 1, completed: 1, rate: { $round: [{ $multiply: [{ $divide: ['$completed', { $max: ['$total', 1] }] }, 100] }, 1] }, _id: 0 } },
    ]),
    TrainingProgram.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: null, programs: { $sum: 1 }, totalHours: { $sum: '$durationHours' } } }]),
  ]);
  return respond.ok(res, { byStatus, byCategory, completionByDept, totals: costAgg[0] || {} });
}));

module.exports = router;
