'use strict';
const express = require('express');
const { Notification } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const { buildQuery, paginate } = require('../utils/query');
const { notify } = require('../utils/notify');
const { Employee, User } = require('../models');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: ['title', 'body'], filterFields: ['type', 'isRead', 'priority'], defaultSort: '-createdAt' });
  opts.filter.user = req.user._id;
  const { items, meta } = await paginate(Notification, opts, {});
  const unread = await Notification.countDocuments({ user: req.user._id, isRead: false });
  return respond.list(res, items, { ...meta, unread });
}));

router.get('/unread-count', asyncHandler(async (req, res) => {
  const [unread, byType] = await Promise.all([
    Notification.countDocuments({ user: req.user._id, isRead: false }),
    Notification.aggregate([{ $match: { user: req.user._id, isRead: false } }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
  ]);
  return respond.ok(res, { unread, byType });
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { isRead: true, readAt: new Date() }, { new: true });
  if (!n) return res.status(404).json({ success: false, message: 'Notification not found' });
  return respond.ok(res, n, 'Marked as read');
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  const result = await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true, readAt: new Date() });
  return respond.ok(res, { updated: result.modifiedCount }, 'All notifications marked as read');
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await Notification.deleteOne({ _id: req.params.id, user: req.user._id });
  return respond.ok(res, { _id: req.params.id }, 'Notification deleted');
}));

/** Admin broadcast — creates an in-app notification for a role / department / everyone. */
router.post('/broadcast', requirePermission('notifications:create', 'announcements:create'), asyncHandler(async (req, res) => {
  const { title, body, type = 'system', role, departmentId, link, sendEmail = false } = req.body;
  if (!title) return res.status(400).json({ success: false, message: 'title is required' });
  let users;
  if (role) users = await User.distinct('_id', { role, isActive: true, deletedAt: null });
  else if (departmentId) users = await Employee.distinct('user', { department: departmentId, isActive: true, deletedAt: null });
  else users = await Employee.distinct('user', { isActive: true, deletedAt: null });
  const targets = users.filter(Boolean);
  await Promise.all(targets.map((userId) => notify({ userId, title, body, type, link, sendEmail })));
  return respond.ok(res, { notified: targets.length }, `Notification sent to ${targets.length} user(s)`);
}));

module.exports = router;
