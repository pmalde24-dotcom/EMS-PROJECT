'use strict';
const express = require('express');
const { z } = require('zod');
const { Project, Task, Employee, Timesheet } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const validate = require('../middleware/validate');
const { requirePermission, directReportIds } = require('../middleware/auth');
const { buildQuery, paginate } = require('../utils/query');
const { recordAudit } = require('../utils/audit');
const { sendCSV } = require('../utils/csv');

const router = express.Router();
const POPULATE = [
  { path: 'manager', select: 'firstName lastName employeeId profilePhoto' },
  { path: 'department', select: 'name code' },
  { path: 'team.employee', select: 'firstName lastName employeeId profilePhoto designation' },
];

const schema = z.object({
  name: z.string().min(2), code: z.string().optional(), description: z.string().optional(), client: z.string().optional(),
  department: z.string().optional().nullable(), manager: z.string().min(1, 'Project manager is required'),
  startDate: z.coerce.date().optional(), endDate: z.coerce.date().optional(),
  status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  budget: z.object({ amount: z.coerce.number().optional(), spent: z.coerce.number().optional(), currency: z.string().optional() }).optional(),
  billable: z.boolean().optional(), tags: z.array(z.string()).optional(),
  team: z.array(z.object({ employee: z.string(), role: z.string().optional(), allocatedPercent: z.coerce.number().optional() })).optional(),
}).passthrough();

/* ── LIST ─────────────────────────────────────────────────────────── */
router.get('/', requirePermission('projects:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: ['name', 'code', 'client', 'description', 'tags'], filterFields: ['status', 'priority', 'manager', 'department', 'billable'], defaultSort: '-createdAt' });
  opts.filter.deletedAt = null;
  if (req.query.mine === 'true') opts.filter['team.employee'] = req.scope.selfEmployeeId;
  const { items, meta } = await paginate(Project, opts, { populate: POPULATE });
  const stats = await Task.aggregate([{ $match: { project: { $in: items.map((i) => i._id) }, deletedAt: null } }, { $group: { _id: '$project', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, overdue: { $sum: { $cond: [{ $and: [{ $lt: ['$dueDate', new Date()] }, { $ne: ['$status', 'completed'] }] }, 1, 0] } }, hours: { $sum: '$loggedHours' } } }]);
  const byId = stats.reduce((a, s) => ({ ...a, [s._id]: s }), {});
  const enriched = items.map((p) => ({ ...p, taskStats: { total: byId[p._id]?.total || 0, completed: byId[p._id]?.completed || 0, overdue: byId[p._id]?.overdue || 0, loggedHours: byId[p._id]?.hours || 0, progressPercent: byId[p._id]?.total ? Math.round((byId[p._id].completed / byId[p._id].total) * 100) : 0 } }));
  if (req.query.export === 'csv') return sendCSV(res, `projects-${Date.now()}.csv`, enriched.map((p) => ({ name: p.name, code: p.code, client: p.client, status: p.status, manager: p.manager ? `${p.manager.firstName} ${p.manager.lastName}` : '', tasks: p.taskStats.total, completed: p.taskStats.completed, progress: `${p.taskStats.progressPercent}%` })));
  return respond.list(res, enriched, meta);
}));

router.get('/:id', requirePermission('projects:view'), asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, deletedAt: null }).populate(POPULATE).lean();
  if (!project) throw ApiError.notFound('Project not found');
  const [taskStats, timesheetStats] = await Promise.all([
    Task.aggregate([{ $match: { project: project._id, deletedAt: null } }, { $group: { _id: '$status', count: { $sum: 1 }, hours: { $sum: '$loggedHours' } } }]),
    Timesheet.aggregate([{ $match: { 'entries.project': project._id } }, { $unwind: '$entries' }, { $match: { 'entries.project': project._id } }, { $group: { _id: null, hours: { $sum: '$entries.hours' }, billable: { $sum: { $cond: ['$entries.billable', '$entries.hours', 0] } } } }]),
  ]);
  return respond.ok(res, { project, taskStats, timesheetStats: timesheetStats[0] || { hours: 0, billable: 0 } });
}));

/* ── CREATE / UPDATE ──────────────────────────────────────────────── */
router.post('/', requirePermission('projects:create'), validate({ body: schema }), asyncHandler(async (req, res) => {
  const manager = await Employee.findById(req.body.manager);
  if (!manager) throw ApiError.badRequest('Project manager not found');
  const project = await Project.create({ ...req.body, createdBy: req.user._id, team: req.body.team || [{ employee: manager._id, role: 'Project Manager', allocatedPercent: 100 }] });
  await recordAudit(req, { action: 'project.create', module: 'projects', targetModel: 'Project', targetId: project._id, description: `Created project "${project.name}"` });
  return respond.created(res, project, 'Project created');
}));

router.patch('/:id', requirePermission('projects:update'), asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) throw ApiError.notFound('Project not found');
  if (!req.scope.isGlobal) {
    const isManager = String(project.manager) === String(req.scope.selfEmployeeId);
    if (!isManager && !['department_manager', 'team_leader'].includes(req.user.role)) throw ApiError.forbidden('Only the project manager can update this project');
  }
  Object.assign(project, req.body);
  if (req.body.status === 'completed') project.actualEndDate = new Date();
  await project.save();
  await recordAudit(req, { action: 'project.update', module: 'projects', targetId: project._id, description: `Updated project "${project.name}"` });
  return respond.ok(res, project, 'Project updated');
}));

router.delete('/:id', requirePermission('projects:delete'), asyncHandler(async (req, res) => {
  const openTasks = await Task.countDocuments({ project: req.params.id, status: { $ne: 'completed' }, deletedAt: null });
  if (openTasks) throw ApiError.conflict(`${openTasks} open task(s) exist in this project. Complete or move them before deleting.`);
  const project = await Project.findByIdAndUpdate(req.params.id, { deletedAt: new Date(), status: 'cancelled' }, { new: true });
  if (!project) throw ApiError.notFound('Project not found');
  await recordAudit(req, { action: 'project.delete', module: 'projects', targetId: project._id, description: `Deleted project "${project.name}"`, severity: 'warning' });
  return respond.ok(res, { _id: project._id }, 'Project deleted');
}));

/* ── TEAM MANAGEMENT ──────────────────────────────────────────────── */
router.post('/:id/team', requirePermission('projects:update', 'tasks:update'), validate({ body: z.object({
  employee: z.string(), role: z.string().optional(), allocatedPercent: z.coerce.number().min(1).max(100).optional(),
}) }), asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) throw ApiError.notFound('Project not found');
  const isManager = String(project.manager) === String(req.scope.selfEmployeeId);
  if (!req.scope.isGlobal && !isManager && !['department_manager', 'team_leader'].includes(req.user.role)) throw ApiError.forbidden('Only the project manager can change the team');
  if (project.team.some((t) => String(t.employee) === String(req.body.employee))) throw ApiError.conflict('This employee is already on the project team');
  project.team.push({ employee: req.body.employee, role: req.body.role || 'Team Member', allocatedPercent: req.body.allocatedPercent || 100 });
  await project.save();
  await recordAudit(req, { action: 'project.team_add', module: 'projects', targetId: project._id, description: `Added team member to "${project.name}"` });
  return respond.ok(res, project.team, 'Team member added');
}));

router.delete('/:id/team/:memberId', requirePermission('projects:update'), asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) throw ApiError.notFound('Project not found');
  const openTasks = await Task.countDocuments({ project: project._id, assignees: req.params.memberId, status: { $nin: ['completed'] }, deletedAt: null });
  if (openTasks) throw ApiError.conflict(`This member has ${openTasks} open task(s). Reassign them before removing from the project.`);
  project.team = project.team.filter((t) => String(t.employee) !== String(req.params.memberId));
  await project.save();
  return respond.ok(res, project.team, 'Team member removed');
}));

/* ── PROGRESS / WORKLOAD ──────────────────────────────────────────── */
router.get('/:id/progress', requirePermission('projects:view'), asyncHandler(async (req, res) => {
  const [byStatus, byAssignee, burn] = await Promise.all([
    Task.aggregate([{ $match: { project: require('mongoose').Types.ObjectId.createFromHexString(String(req.params.id)), deletedAt: null } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Task.aggregate([{ $match: { project: require('mongoose').Types.ObjectId.createFromHexString(String(req.params.id)), deletedAt: null } }, { $unwind: '$assignees' }, { $group: { _id: '$assignees', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, hours: { $sum: '$loggedHours' } } }, { $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'e' } }, { $unwind: '$e' }, { $project: { name: { $concat: ['$e.firstName', ' ', '$e.lastName'] }, employeeId: '$e.employeeId', total: 1, completed: 1, hours: 1, _id: 0 } }]),
    Task.aggregate([{ $match: { project: require('mongoose').Types.ObjectId.createFromHexString(String(req.params.id)), completedAt: { $ne: null }, deletedAt: null } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } }, completed: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
  ]);
  const total = byStatus.reduce((s, x) => s + x.count, 0);
  const done = byStatus.find((x) => x._id === 'completed')?.count || 0;
  return respond.ok(res, { byStatus, byAssignee, burndown: burn, total, completed: done, progressPercent: total ? Math.round((done / total) * 100) : 0 });
}));

module.exports = router;
