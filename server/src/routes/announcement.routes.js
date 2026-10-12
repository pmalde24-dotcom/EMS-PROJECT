'use strict';
const { z } = require('zod');
const { Announcement, Employee } = require('../models');
const { crudFactory } = require('../utils/crudFactory');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const { requirePermission } = require('../middleware/auth');
const { notifyMany } = require('../utils/notify');
const mongoose = require('mongoose');

const schema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(5),
  summary: z.string().max(300).optional(),
  category: z.enum(['general', 'hr', 'policy', 'event', 'holiday', 'payroll', 'it', 'celebration', 'urgent']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  audience: z.object({
    type: z.enum(['all', 'departments', 'designations', 'roles', 'employees']).optional(),
    departments: z.array(z.string()).optional(), designations: z.array(z.string()).optional(),
    roles: z.array(z.string()).optional(), employees: z.array(z.string()).optional(),
  }).optional(),
  publishAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional().nullable(),
  status: z.enum(['draft', 'scheduled', 'published', 'expired', 'archived']).optional(),
  pinned: z.boolean().optional(),
  requireAcknowledgement: z.boolean().optional(),
  sendEmail: z.boolean().optional(),
  attachments: z.array(z.object({ fileName: z.string().optional(), url: z.string(), fileType: z.string().optional(), size: z.number().optional() })).optional(),
}).passthrough();

/** Resolves the audience of an announcement to a list of User ids. */
async function resolveAudience(aud) {
  if (!aud || aud.type === 'all' || !aud.type) return Employee.distinct('user', { deletedAt: null, isActive: true });
  const filter = { deletedAt: null, isActive: true, employmentStatus: { $nin: ['terminated', 'resigned', 'retired'] } };
  if (aud.type === 'departments') filter.department = { $in: aud.departments || [] };
  if (aud.type === 'designations') filter.designation = { $in: aud.designations || [] };
  if (aud.type === 'employees') filter._id = { $in: (aud.employees || []).map((e) => new mongoose.Types.ObjectId(e)) };
  if (aud.type === 'roles') {
    const { User } = require('../models');
    return User.distinct('_id', { role: { $in: aud.roles || [] }, isActive: true, deletedAt: null });
  }
  const ids = await Employee.distinct('user', filter);
  return ids.filter(Boolean);
}

module.exports = crudFactory({
  model: Announcement,
  module: 'announcements',
  name: 'Announcement',
  searchFields: ['title', 'body', 'summary'],
  filterFields: ['category', 'status', 'priority', 'pinned'],
  defaultSort: '-publishAt',
  createSchema: schema,
  populate: [{ path: 'createdBy', select: 'name role' }],
  beforeCreate: async (req, payload) => {
    payload.createdBy = req.user._id;
    if (payload.publishAt && payload.publishAt > new Date()) payload.status = payload.status || 'scheduled';
  },
  extra(router) {
    /** Feed for the current user with read status. */
    router.get('/feed/me', asyncHandler(async (req, res) => {
      const emp = req.scope.selfEmployeeId;
      const deptId = req.scope.departmentId;
      const now = new Date();
      const items = await Announcement.find({
        deletedAt: null,
        status: 'published',
        publishAt: { $lte: now },
        $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }] }],
        $or: [
          { 'audience.type': 'all' },
          { 'audience.type': null },
          { 'audience.departments': deptId },
          { 'audience.employees': emp },
          { 'audience.roles': req.user.role },
        ],
      }).sort('-pinned -publishAt').limit(100).populate('createdBy', 'name role').lean();

      const withRead = items.map((a) => ({
        ...a,
        isRead: (a.readBy || []).some((r) => String(r.employee) === String(emp)),
        isAcknowledged: (a.acknowledgements || []).some((r) => String(r.employee) === String(emp)),
        readBy: undefined,
      }));
      return respond.list(res, withRead, { total: withRead.length, unread: withRead.filter((a) => !a.isRead).length });
    }));

    /** Mark an announcement read (and acknowledged when required). */
    router.post('/:id/read', asyncHandler(async (req, res) => {
      const emp = req.scope.selfEmployeeId;
      const update = { $addToSet: { readBy: { employee: emp, at: new Date() } }, $inc: { views: 1 } };
      const announce = await Announcement.findById(req.params.id);
      if (!announce) return res.status(404).json({ success: false, message: 'Announcement not found' });
      if (announce.requireAcknowledgement && req.body?.acknowledge) {
        update.$addToSet.acknowledgements = { employee: emp, at: new Date(), ip: req.ip };
      }
      await Announcement.updateOne({ _id: req.params.id }, update);
      return respond.ok(res, null, 'Marked as read');
    }));

    /** Publish a scheduled draft + fan out notifications. */
    router.post('/:id/publish', requirePermission('announcements:create', 'announcements:update'), asyncHandler(async (req, res) => {
      const announce = await Announcement.findById(req.params.id);
      if (!announce) return res.status(404).json({ success: false, message: 'Announcement not found' });
      announce.status = 'published';
      announce.publishAt = announce.publishAt && announce.publishAt <= new Date() ? announce.publishAt : new Date();
      await announce.save();
      const users = await resolveAudience(announce.audience);
      await notifyMany(users, {
        title: announce.title, body: announce.summary || announce.body.slice(0, 160),
        type: 'announcement', link: `/announcements/${announce._id}`, priority: announce.priority === 'critical' ? 'high' : 'normal',
        sendEmail: announce.sendEmail, refModel: 'Announcement', refId: announce._id,
      });
      return respond.ok(res, { notified: users.length }, `Announcement published and sent to ${users.length} user(s)`);
    }));

    router.get('/:id/stats', requirePermission('announcements:view'), asyncHandler(async (req, res) => {
      const a = await Announcement.findById(req.params.id).populate('readBy.employee', 'firstName lastName employeeId').populate('acknowledgements.employee', 'firstName lastName employeeId').lean();
      if (!a) return res.status(404).json({ success: false, message: 'Announcement not found' });
      return respond.ok(res, { views: a.views, readCount: (a.readBy || []).length, acknowledgementCount: (a.acknowledgements || []).length, readBy: a.readBy, acknowledgements: a.acknowledgements });
    }));
  },
});
