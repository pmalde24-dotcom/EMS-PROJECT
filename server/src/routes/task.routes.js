'use strict';
const express = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const { Task, TaskComment, Project, Employee, Timesheet } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const validate = require('../middleware/validate');
const { requirePermission, directReportIds } = require('../middleware/auth');
const { buildQuery, paginate } = require('../utils/query');
const { recordAudit } = require('../utils/audit');
const { sendCSV } = require('../utils/csv');
const { notify, notifyMany } = require('../utils/notify');
const { fileUploader, persistFile } = require('../utils/upload');

const router = express.Router();
const POPULATE = [
  { path: 'assignees', select: 'firstName lastName employeeId profilePhoto designation' },
  { path: 'project', select: 'name code' },
  { path: 'assignedBy', select: 'firstName lastName employeeId' },
];

async function assertCanAssign(req, assigneeIds) {
  if (req.scope.isGlobal) return;
  if (!(req.user.__perms || []).includes('tasks:create') && !(req.user.__perms || []).includes('*')) throw ApiError.forbidden('You are not allowed to create tasks');
  const teamIds = [req.scope.selfEmployeeId, ...(await directReportIds(req.scope.selfEmployeeId))].map(String);
  const outside = assigneeIds.filter((id) => !teamIds.includes(String(id)));
  if (outside.length) throw ApiError.forbidden('You can only assign tasks to members of your team');
}

/* ── LIST / BOARD ─────────────────────────────────────────────────── */
router.get('/', requirePermission('tasks:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: ['title', 'description', 'tags'], filterFields: ['status', 'priority', 'project', 'assignees', 'department', 'billable'], defaultSort: '-createdAt' });
  opts.filter.deletedAt = null;
  delete opts.filter.assignees;
  if (req.query.assignees) opts.filter.assignees = { $in: String(req.query.assignees).split(',') };
  if (req.query.mine === 'true' || (!req.scope.isGlobal && req.query.all !== 'true')) opts.filter.assignees = { $in: [req.scope.selfEmployeeId] };
  if (req.query.team === 'true' && !req.scope.isGlobal) {
    const ids = [req.scope.selfEmployeeId, ...(await directReportIds(req.scope.selfEmployeeId))];
    opts.filter.assignees = { $in: ids };
  }
  if (req.query.overdue === 'true') opts.filter.dueDate = { $lt: new Date() }, opts.filter.status = { $nin: ['completed'] };
  const { items, meta } = await paginate(Task, opts, { populate: POPULATE });
  const enriched = items.map((t) => ({ ...t, isOverdue: !!(t.dueDate && !t.completedAt && new Date(t.dueDate) < new Date() && t.status !== 'completed') }));
  if (req.query.export === 'csv') {
    return sendCSV(res, `tasks-${Date.now()}.csv`, enriched, [
      { key: 'title', label: 'Task' }, { key: 'project.name', label: 'Project' }, { key: 'status', label: 'Status' },
      { key: 'priority', label: 'Priority' },
      { key: 'assignees', label: 'Assignees', value: (r) => (r.assignees || []).map((a) => `${a.firstName} ${a.lastName}`).join('; ') },
      { key: 'dueDate', label: 'Due', value: (r) => (r.dueDate ? new Date(r.dueDate).toISOString().slice(0, 10) : '') },
      { key: 'progressPercent', label: 'Progress %' },
    ]);
  }
  return respond.list(res, enriched, meta);
}));

/** Kanban board grouped by status. */
router.get('/board/kanban', requirePermission('tasks:view'), asyncHandler(async (req, res) => {
  const filter = { deletedAt: null };
  if (req.query.project) filter.project = req.query.project;
  if (req.query.mine === 'true' || !req.scope.isGlobal) filter.assignees = { $in: [req.scope.selfEmployeeId] };
  if (req.query.assignee) filter.assignees = { $in: [req.query.assignee] };
  const tasks = await Task.find(filter).populate(POPULATE).sort('order dueDate').limit(600).lean();
  const columns = ['todo', 'in_progress', 'in_review', 'completed', 'blocked'].map((status) => ({
    status, count: tasks.filter((t) => t.status === status).length,
    tasks: tasks.filter((t) => t.status === status).map((t) => ({ ...t, isOverdue: !!(t.dueDate && !t.completedAt && new Date(t.dueDate) < new Date() && t.status !== 'completed') })),
  }));
  return respond.ok(res, { columns, total: tasks.length });
}));

/** My tasks summary for the employee dashboard. */
router.get('/me/summary', requirePermission('tasks:view'), asyncHandler(async (req, res) => {
  const empId = req.scope.selfEmployeeId;
  if (!empId) throw ApiError.forbidden('Your login is not linked to an employee record');
  const [byStatus, upcoming, overdue, loggedHours] = await Promise.all([
    Task.aggregate([{ $match: { assignees: new mongoose.Types.ObjectId(empId), deletedAt: null } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Task.find({ assignees: empId, status: { $nin: ['completed'] }, deletedAt: null }).populate('project', 'name code').sort('dueDate').limit(10).lean(),
    Task.countDocuments({ assignees: empId, status: { $nin: ['completed'] }, dueDate: { $lt: new Date() }, deletedAt: null }),
    Timesheet.aggregate([{ $match: { employee: new mongoose.Types.ObjectId(empId) } }, { $unwind: '$entries' }, { $match: { 'entries.task': { $ne: null } } }, { $group: { _id: null, hours: { $sum: '$entries.hours' } } }]),
  ]);
  return respond.ok(res, { byStatus, upcoming, overdue, loggedHours: loggedHours[0]?.hours || 0, total: byStatus.reduce((s, x) => s + x.count, 0) });
}));

router.get('/:id', requirePermission('tasks:view'), asyncHandler(async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, deletedAt: null }).populate(POPULATE).populate('parentTask', 'title status').populate('dependsOn', 'title status').lean();
  if (!task) throw ApiError.notFound('Task not found');
  const comments = await TaskComment.find({ task: task._id }).populate('author', 'name role').sort('createdAt').lean();
  return respond.ok(res, { ...task, comments });
}));

/* ── CREATE ───────────────────────────────────────────────────────── */
router.post('/', requirePermission('tasks:create'), validate({ body: z.object({
  title: z.string().min(3), description: z.string().optional(),
  project: z.string().optional().nullable(), parentTask: z.string().optional().nullable(),
  assignees: z.array(z.string()).min(1, 'At least one assignee is required'),
  status: z.enum(['todo', 'in_progress', 'in_review', 'completed', 'blocked']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  startDate: z.coerce.date().optional(), dueDate: z.coerce.date().optional(),
  estimatedHours: z.coerce.number().min(0).optional(), billable: z.boolean().optional(),
  tags: z.array(z.string()).optional(), subtasks: z.array(z.object({ title: z.string() })).optional(),
  dependsOn: z.array(z.string()).optional(),
}) }), asyncHandler(async (req, res) => {
  await assertCanAssign(req, req.body.assignees);
  if (req.body.project) {
    const project = await Project.findOne({ _id: req.body.project, deletedAt: null });
    if (!project) throw ApiError.badRequest('Project not found');
  }
  const task = await Task.create({
    ...req.body, assignedBy: req.scope.selfEmployeeId, createdBy: req.user._id,
    department: req.body.department || req.scope.departmentId,
    activity: [{ by: req.user._id, action: 'created', note: 'Task created' }],
  });
  const employees = await Employee.find({ _id: { $in: req.body.assignees } }).select('user firstName').lean();
  await notifyMany(employees.map((e) => e.user), {
    title: 'New task assigned', body: `"${task.title}"${req.body.dueDate ? ` — due ${new Date(req.body.dueDate).toDateString()}` : ''}`, type: 'task', link: `/tasks/${task._id}`, sendEmail: true, refModel: 'Task', refId: task._id,
  });
  await recordAudit(req, { action: 'task.create', module: 'tasks', targetModel: 'Task', targetId: task._id, description: `Created task "${task.title}" for ${req.body.assignees.length} assignee(s)` });
  return respond.created(res, await Task.findById(task._id).populate(POPULATE), 'Task created');
}));

/* ── UPDATE ───────────────────────────────────────────────────────── */
router.patch('/:id', requirePermission('tasks:update'), asyncHandler(async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, deletedAt: null });
  if (!task) throw ApiError.notFound('Task not found');
  const isAssignee = task.assignees.map(String).includes(String(req.scope.selfEmployeeId));
  const isCreator = String(task.assignedBy) === String(req.scope.selfEmployeeId);
  const isManager = req.scope.isGlobal || ['department_manager', 'team_leader'].includes(req.user.role);
  if (!isAssignee && !isCreator && !isManager) throw ApiError.forbidden('You can only update tasks assigned to you or your team');
  // Assignees may only progress status / progress / log time
  const body = { ...req.body };
  if (isAssignee && !isCreator && !isManager) {
    const allowed = ['status', 'progressPercent', 'blockedReason', 'subtasks'];
    Object.keys(body).forEach((k) => { if (!allowed.includes(k)) delete body[k]; });
  }
  const before = { status: task.status, progressPercent: task.progressPercent };
  Object.assign(task, body);
  if (body.status === 'completed' && task.status !== before.status) {
    task.completedAt = new Date(); task.completedBy = req.scope.selfEmployeeId; task.progressPercent = 100;
    task.subtasks.forEach((s) => { if (!s.completed) { s.completed = true; s.completedAt = new Date(); } });
  }
  if (body.status && body.status !== 'completed') task.completedAt = undefined;
  task.activity.push({ by: req.user._id, action: 'updated', note: `status: ${before.status} → ${task.status}` });
  await task.save();
  if (before.status !== task.status && task.assignedBy && String(task.assignedBy) !== String(req.scope.selfEmployeeId)) {
    const owner = await Employee.findById(task.assignedBy).select('user').lean();
    await notify({ userId: owner?.user, title: 'Task status updated', body: `"${task.title}" moved to ${String(task.status).replace('_', ' ')}`, type: 'task', link: `/tasks/${task._id}` });
  }
  await recordAudit(req, { action: 'task.update', module: 'tasks', targetId: task._id, description: `Updated task "${task.title}"` });
  return respond.ok(res, await Task.findById(task._id).populate(POPULATE), 'Task updated');
}));

/* ── STATUS MOVE (Kanban drag) ────────────────────────────────────── */
router.post('/:id/status', requirePermission('tasks:update'), validate({ body: z.object({ status: z.enum(['todo', 'in_progress', 'in_review', 'completed', 'blocked']), order: z.coerce.number().optional(), note: z.string().optional() }) }),
  asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) throw ApiError.notFound('Task not found');
    const before = task.status;
    task.status = req.body.status;
    if (req.body.order !== undefined) task.order = req.body.order;
    if (req.body.status === 'completed') { task.completedAt = new Date(); task.progressPercent = 100; }
    else if (before === 'completed') task.completedAt = undefined;
    if (req.body.status === 'blocked' && req.body.note) task.blockedReason = req.body.note;
    task.activity.push({ by: req.user._id, action: 'status_changed', note: `${before} → ${task.status}${req.body.note ? `: ${req.body.note}` : ''}` });
    await task.save();
    await recordAudit(req, { action: 'task.status_change', module: 'tasks', targetId: task._id, description: `Task "${task.title}": ${before} → ${task.status}` });
    return respond.ok(res, task, 'Status updated');
  })
);

/* ── SUBTASKS ─────────────────────────────────────────────────────── */
router.post('/:id/subtasks', requirePermission('tasks:update'), validate({ body: z.object({ title: z.string().min(2), assignee: z.string().optional().nullable() }) }), asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) throw ApiError.notFound('Task not found');
  task.subtasks.push({ title: req.body.title, assignee: req.body.assignee || null, order: task.subtasks.length });
  await task.save();
  return respond.created(res, task.subtasks[task.subtasks.length - 1], 'Subtask added');
}));

router.patch('/:id/subtasks/:subtaskId', requirePermission('tasks:update'), asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  const sub = task?.subtasks.id(req.params.subtaskId);
  if (!task || !sub) throw ApiError.notFound('Subtask not found');
  if (req.body.title) sub.title = req.body.title;
  if (req.body.completed !== undefined) { sub.completed = req.body.completed; sub.completedAt = req.body.completed ? new Date() : undefined; }
  const done = task.subtasks.filter((s) => s.completed).length;
  task.progressPercent = task.subtasks.length ? Math.round((done / task.subtasks.length) * 100) : task.progressPercent;
  await task.save();
  return respond.ok(res, sub, 'Subtask updated');
}));

/* ── COMMENTS ─────────────────────────────────────────────────────── */
router.post('/:id/comments', requirePermission('tasks:view'), validate({ body: z.object({ body: z.string().min(1).max(3000), mentions: z.array(z.string()).optional() }) }), asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id).populate('assignees', 'firstName user');
  if (!task) throw ApiError.notFound('Task not found');
  const comment = await TaskComment.create({ task: task._id, author: req.user._id, authorEmployee: req.scope.selfEmployeeId, body: req.body.body, mentions: req.body.mentions || [] });
  task.commentsCount = (task.commentsCount || 0) + 1;
  task.activity.push({ by: req.user._id, action: 'commented', note: req.body.body.slice(0, 120) });
  await task.save();
  const mentioned = await Employee.find({ _id: { $in: req.body.mentions || [] } }).select('user').lean();
  const targets = new Set([...task.assignees.map((a) => String(a.user)), ...mentioned.map((m) => String(m.user))]);
  targets.delete(String(req.user._id));
  await notifyMany([...targets].filter((t) => t !== 'undefined'), { title: 'New comment on task', body: `${req.user.name}: ${req.body.body.slice(0, 120)}`, type: 'task', link: `/tasks/${task._id}` });
  const populated = await TaskComment.findById(comment._id).populate('author', 'name role').lean();
  return respond.created(res, populated, 'Comment added');
}));

router.delete('/:id/comments/:commentId', asyncHandler(async (req, res) => {
  const comment = await TaskComment.findById(req.params.commentId);
  if (!comment) throw ApiError.notFound('Comment not found');
  const canDelete = String(comment.author) === String(req.user._id) || (req.user.__perms || []).includes('tasks:delete');
  if (!canDelete) throw ApiError.forbidden('You can only delete your own comments');
  await comment.deleteOne();
  await Task.findByIdAndUpdate(req.params.id, { $inc: { commentsCount: -1 } });
  return respond.ok(res, { _id: req.params.commentId }, 'Comment deleted');
}));

/* ── ATTACHMENTS ──────────────────────────────────────────────────── */
router.post('/:id/attachments', requirePermission('tasks:update'), fileUploader({ types: require('../utils/upload').ALLOWED_ALL, maxSizeMB: 10 }), asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Please attach a file');
  const task = await Task.findById(req.params.id);
  if (!task) throw ApiError.notFound('Task not found');
  const meta = await persistFile(req.file);
  task.attachments.push({ fileName: meta.fileName, url: meta.url, fileType: meta.fileType, size: meta.size, uploadedBy: req.scope.selfEmployeeId, uploadedAt: new Date() });
  await task.save();
  return respond.created(res, task.attachments[task.attachments.length - 1], 'Attachment uploaded');
}));

/* ── DELETE ───────────────────────────────────────────────────────── */
router.delete('/:id', requirePermission('tasks:delete'), asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) throw ApiError.notFound('Task not found');
  const isCreator = String(task.assignedBy) === String(req.scope.selfEmployeeId);
  if (!req.scope.isGlobal && !isCreator && req.user.role !== 'department_manager') throw ApiError.forbidden('Only the task creator or a manager can delete this task');
  task.deletedAt = new Date();
  await task.save();
  await recordAudit(req, { action: 'task.delete', module: 'tasks', targetId: task._id, description: `Deleted task "${task.title}"`, severity: 'warning' });
  return respond.ok(res, { _id: task._id }, 'Task deleted');
}));

/* ── WORKLOAD ─────────────────────────────────────────────────────── */
router.get('/reports/workload', requirePermission('tasks:view', 'reports:view'), asyncHandler(async (req, res) => {
  const filter = { deletedAt: null, status: { $nin: ['completed'] } };
  if (req.query.department) {
    const ids = await Employee.distinct('_id', { department: req.query.department });
    filter.assignees = { $in: ids };
  } else if (!req.scope.isGlobal) {
    filter.assignees = { $in: [req.scope.selfEmployeeId, ...(await directReportIds(req.scope.selfEmployeeId))] };
  }
  const agg = await Task.aggregate([
    { $match: filter }, { $unwind: '$assignees' },
    { $group: { _id: '$assignees', open: { $sum: 1 }, overdue: { $sum: { $cond: [{ $and: [{ $lt: ['$dueDate', new Date()] }] }, 1, 0] } }, estimated: { $sum: '$estimatedHours' }, logged: { $sum: '$loggedHours' } } },
    { $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'e' } }, { $unwind: '$e' },
    { $project: { name: { $concat: ['$e.firstName', ' ', '$e.lastName'] }, employeeId: '$e.employeeId', open: 1, overdue: 1, estimated: 1, logged: 1, utilization: { $cond: [{ $gt: ['$estimated', 0] }, { $multiply: [{ $divide: ['$logged', '$estimated'] }, 100] }, 0] } } },
    { $sort: { open: -1 } },
  ]);
  return respond.list(res, agg, { total: agg.length });
}));

/* ── OVERDUE TASKS ────────────────────────────────────────────────── */
router.get('/reports/overdue', requirePermission('tasks:view'), asyncHandler(async (req, res) => {
  const filter = { deletedAt: null, status: { $nin: ['completed'] }, dueDate: { $lt: new Date() } };
  if (!req.scope.isGlobal) filter.assignees = { $in: [req.scope.selfEmployeeId, ...(await directReportIds(req.scope.selfEmployeeId))] };
  const tasks = await Task.find(filter).populate(POPULATE).sort('dueDate').limit(200).lean();
  return respond.list(res, tasks.map((t) => ({ ...t, daysOverdue: Math.round((Date.now() - new Date(t.dueDate)) / 86400000) })), { total: tasks.length });
}));

module.exports = router;
