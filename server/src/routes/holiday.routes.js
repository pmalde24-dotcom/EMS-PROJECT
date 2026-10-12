'use strict';
const { z } = require('zod');
const { Holiday } = require('../models');
const { crudFactory } = require('../utils/crudFactory');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const { requirePermission } = require('../middleware/auth');
const { sendCSV } = require('../utils/csv');

const schema = z.object({
  name: z.string().min(2),
  date: z.coerce.date(),
  type: z.enum(['public', 'regional', 'company', 'optional', 'restricted']).optional(),
  description: z.string().optional(),
  region: z.string().optional(),
  departments: z.array(z.string()).optional(),
  isRecurring: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).passthrough();

module.exports = crudFactory({
  model: Holiday,
  module: 'holidays',
  name: 'Holiday',
  searchFields: ['name', 'description', 'region'],
  filterFields: ['year', 'type', 'region', 'isActive'],
  defaultSort: 'date',
  createSchema: schema,
  softDelete: false,
  populate: [{ path: 'departments', select: 'name code' }],
  beforeCreate: async (req, payload) => { payload.year = new Date(payload.date).getFullYear(); payload.createdBy = req.user._id; },
  beforeUpdate: async (req, payload) => { if (payload.date) payload.year = new Date(payload.date).getFullYear(); },
  csvColumns: [{ key: 'name', label: 'Holiday' }, { key: 'date', label: 'Date', value: (r) => new Date(r.date).toISOString().slice(0, 10) }, { key: 'type', label: 'Type' }, { key: 'region', label: 'Region' }],
  extra(router) {
    router.get('/calendar/:year', asyncHandler(async (req, res) => {
      const items = await Holiday.find({ year: Number(req.params.year), isActive: true }).sort('date').populate('departments', 'name').lean();
      return respond.list(res, items, { total: items.length });
    }));
  },
});
