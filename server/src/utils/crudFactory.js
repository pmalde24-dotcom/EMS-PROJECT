'use strict';
const express = require('express');
const { buildQuery, paginate } = require('./query');
const { requirePermission } = require('../middleware/auth');
const { recordAudit } = require('./audit');
const { sendCSV } = require('./csv');
const ApiError = require('./ApiError');
const asyncHandler = require('./asyncHandler');
const respond = require('./respond');

const titleCase = (s) => String(s).replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Builds a standard REST router (list / get / create / update / delete / bulk / export)
 * with permission checks, validation, audit logging, pagination and soft deletes.
 * Pass `extra` to append module-specific endpoints.
 */
function crudFactory({
  model, module, name = titleCase(module), searchFields = [], filterFields = [],
  populate = [], defaultSort = '-createdAt', createSchema, updateSchema,
  beforeCreate, beforeUpdate, afterCreate, afterUpdate, afterDelete,
  softDelete = true, scopeFn, select, csvColumns, idParam = 'id', extra,
}) {
  const router = express.Router();
  const findOnePopulated = (id) => {
    let q = model.findOne({ _id: id });
    populate.forEach((p) => { q = q.populate(p); });
    if (select) q = q.select(select);
    return q;
  };

  // LIST
  router.get('/', requirePermission(`${module}:view`), asyncHandler(async (req, res) => {
    const opts = buildQuery(req.query, { searchFields, filterFields, defaultSort });
    if (softDelete && opts.filter.deletedAt === undefined) opts.filter.deletedAt = null;
    if (scopeFn) Object.assign(opts.filter, await scopeFn(req, opts));
    const { items, meta } = await paginate(model, opts, { populate, select });
    if (req.query.export === 'csv') {
      const cols = req.query.columns ? String(req.query.columns).split(',') : undefined;
      return sendCSV(res, `${module}-${Date.now()}.csv`, items, csvColumns || cols);
    }
    return respond.list(res, items, meta);
  }));

  // GET ONE
  router.get(`/:${idParam}`, requirePermission(`${module}:view`), asyncHandler(async (req, res) => {
    const doc = await findOnePopulated(req.params[idParam]);
    if (!doc || (softDelete && doc.deletedAt)) throw ApiError.notFound(`${name} not found`);
    return respond.ok(res, doc);
  }));

  // CREATE
  if (createSchema !== false) {
    router.post('/', requirePermission(`${module}:create`), asyncHandler(async (req, res) => {
      const payload = { ...req.body };
      if (beforeCreate) await beforeCreate(req, payload);
      const doc = await model.create(payload);
      await recordAudit(req, { action: `${module}.create`, module, targetModel: model.modelName, targetId: doc._id, description: `Created ${name}` });
      if (afterCreate) await afterCreate(req, doc);
      return respond.created(res, doc, `${name} created successfully`);
    }));
  }

  // UPDATE
  router.patch(`/:${idParam}`, requirePermission(`${module}:update`), asyncHandler(async (req, res) => {
    const doc = await model.findById(req.params[idParam]);
    if (!doc || (softDelete && doc.deletedAt)) throw ApiError.notFound(`${name} not found`);
    const before = doc.toObject();
    const payload = { ...req.body };
    if (beforeUpdate) await beforeUpdate(req, payload, doc);
    Object.assign(doc, payload);
    await doc.save();
    await recordAudit(req, { action: `${module}.update`, module, targetModel: model.modelName, targetId: doc._id, description: `Updated ${name}`, metadata: diff(before, doc.toObject()) });
    if (afterUpdate) await afterUpdate(req, doc, before);
    return respond.ok(res, doc, `${name} updated successfully`);
  }));

  // RESTORE (soft-deleted)
  if (softDelete) {
    router.post(`/:${idParam}/restore`, requirePermission(`${module}:update`), asyncHandler(async (req, res) => {
      const doc = await model.findByIdAndUpdate(req.params[idParam], { deletedAt: null, deletedBy: null }, { new: true });
      if (!doc) throw ApiError.notFound(`${name} not found`);
      await recordAudit(req, { action: `${module}.restore`, module, targetModel: model.modelName, targetId: doc._id, description: `Restored ${name}` });
      return respond.ok(res, doc, `${name} restored`);
    }));
  }

  // DELETE
  router.delete(`/:${idParam}`, requirePermission(`${module}:delete`), asyncHandler(async (req, res) => {
    const doc = await model.findById(req.params[idParam]);
    if (!doc || (softDelete && doc.deletedAt)) throw ApiError.notFound(`${name} not found`);
    if (afterDelete) await afterDelete(req, doc);
    if (softDelete) {
      doc.deletedAt = new Date();
      doc.deletedBy = req.user._id;
      if ('isActive' in doc) doc.isActive = false;
      await doc.save();
    } else {
      await doc.deleteOne();
    }
    await recordAudit(req, { action: `${module}.delete`, module, targetModel: model.modelName, targetId: doc._id, description: `Deleted ${name}`, severity: 'warning' });
    return respond.ok(res, { _id: doc._id }, `${name} deleted`);
  }));

  // BULK OPERATIONS
  router.post('/bulk', requirePermission(`${module}:update`), asyncHandler(async (req, res) => {
    const { ids = [], action = 'delete', payload = {} } = req.body;
    if (!Array.isArray(ids) || !ids.length) throw ApiError.badRequest('`ids` array is required');
    let result;
    if (action === 'delete') {
      if (!(await requirePerm(req, `${module}:delete`))) throw ApiError.forbidden(`Missing permission: ${module}:delete`);
      result = softDelete
        ? await model.updateMany({ _id: { $in: ids } }, { deletedAt: new Date(), deletedBy: req.user._id, isActive: false })
        : await model.deleteMany({ _id: { $in: ids } });
    } else if (action === 'update') {
      result = await model.updateMany({ _id: { $in: ids } }, payload);
    } else if (action === 'restore') {
      result = await model.updateMany({ _id: { $in: ids } }, { deletedAt: null });
    } else throw ApiError.badRequest(`Unsupported bulk action: ${action}`);
    await recordAudit(req, { action: `${module}.bulk_${action}`, module, description: `Bulk ${action} on ${ids.length} ${name} record(s)`, metadata: { ids: ids.slice(0, 50) }, severity: 'warning' });
    return respond.ok(res, { matched: result.matchedCount ?? result.deletedCount ?? 0, modified: result.modifiedCount ?? result.deletedCount ?? 0 }, `Bulk ${action} completed`);
  }));

  // EXPORT
  router.get('/export/csv', requirePermission(`${module}:view`, `${module}:export`), asyncHandler(async (req, res) => {
    const opts = buildQuery(req.query, { searchFields, filterFields, defaultSort });
    if (softDelete) opts.filter.deletedAt = null;
    opts.limit = 5000;
    const { items } = await paginate(model, opts, { populate });
    return sendCSV(res, `${module}-export-${new Date().toISOString().slice(0, 10)}.csv`, items, csvColumns);
  }));

  if (extra) extra(router);
  return router;
}

async function requirePerm(req, key) {
  const perms = req.user.__perms || [];
  return perms.includes('*') || perms.includes(key);
}

function diff(before, after, keys) {
  const out = {};
  const fields = keys || Object.keys(after);
  fields.forEach((k) => {
    if (['updatedAt', 'createdAt', '_id', '__v', 'id'].includes(k)) return;
    const a = JSON.stringify(before[k]);
    const b = JSON.stringify(after[k]);
    if (a !== b && b !== undefined) out[k] = { from: before[k], to: after[k] };
  });
  return Object.keys(out).length ? out : undefined;
}

module.exports = { crudFactory, diff };
