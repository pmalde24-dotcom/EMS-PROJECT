'use strict';
const express = require('express');
const { AuditLog } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const { requirePermission } = require('../middleware/auth');
const { buildQuery, paginate } = require('../utils/query');
const { sendCSV } = require('../utils/csv');

const router = express.Router();

/** Read-only audit trail. Records are append-only at the model layer. */
const listLogs = asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, {
    searchFields: ['description', 'action', 'actorName', 'targetId', 'module'],
    filterFields: ['module', 'action', 'severity', 'actor', 'actorRole'], defaultSort: '-at',
  });
  const { items, meta } = await paginate(AuditLog, opts, {});
  if (req.query.export === 'csv') {
    return sendCSV(res, `audit-log-${new Date().toISOString().slice(0, 10)}.csv`, items, [
      { key: 'at', label: 'Timestamp', value: (r) => new Date(r.at).toISOString() },
      { key: 'actorName', label: 'Actor' }, { key: 'actorRole', label: 'Role' },
      { key: 'action', label: 'Action' }, { key: 'module', label: 'Module' },
      { key: 'description', label: 'Description' }, { key: 'severity', label: 'Severity' },
      { key: 'ip', label: 'IP' },
    ]);
  }
  return respond.list(res, items, meta);
});

router.get('/', requirePermission('audit:view'), listLogs);
router.get('/logs', requirePermission('audit:view'), listLogs);

router.get('/stats', requirePermission('audit:view'), asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 30 * 86400000);
  const [byModule, bySeverity, byDay, topActors] = await Promise.all([
    AuditLog.aggregate([{ $match: { at: { $gte: since } } }, { $group: { _id: '$module', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 15 }]),
    AuditLog.aggregate([{ $match: { at: { $gte: since } } }, { $group: { _id: '$severity', count: { $sum: 1 } } }]),
    AuditLog.aggregate([{ $match: { at: { $gte: since } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$at' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    AuditLog.aggregate([{ $match: { at: { $gte: since } } }, { $group: { _id: '$actorName', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
  ]);
  return respond.ok(res, { byModule, bySeverity, byDay: byDay.map((d) => ({ date: d._id, count: d.count })), topActors });
}));

/** A single target record's audit history. */
router.get('/record/:model/:id', requirePermission('audit:view'), asyncHandler(async (req, res) => {
  const items = await AuditLog.find({ targetModel: req.params.model, targetId: req.params.id }).sort('-at').limit(200).lean();
  return respond.list(res, items, { total: items.length });
}));

module.exports = router;
