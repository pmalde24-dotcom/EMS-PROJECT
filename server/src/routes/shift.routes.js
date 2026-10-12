'use strict';
const { z } = require('zod');
const { Shift, Employee } = require('../models');
const { crudFactory } = require('../utils/crudFactory');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const { requirePermission } = require('../middleware/auth');

const schema = z.object({
  name: z.string().min(2),
  code: z.string().optional(),
  startTime: z.string().regex(/^\d{1,2}:\d{2}$/, 'Use HH:MM'),
  endTime: z.string().regex(/^\d{1,2}:\d{2}$/, 'Use HH:MM'),
  breakMinutes: z.coerce.number().min(0).max(240).optional(),
  graceMinutes: z.coerce.number().min(0).max(120).optional(),
  weeklyOffs: z.array(z.coerce.number().min(0).max(6)).optional(),
  isNightShift: z.boolean().optional(),
  rotational: z.boolean().optional(),
  departments: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  description: z.string().optional(),
}).passthrough();

module.exports = crudFactory({
  model: Shift,
  module: 'shifts',
  name: 'Shift',
  searchFields: ['name', 'code'],
  filterFields: ['isActive', 'isNightShift'],
  defaultSort: 'name',
  createSchema: schema,
  softDelete: false,
  populate: [{ path: 'departments', select: 'name code' }],
  extra(router) {
    router.post('/:id/assign', requirePermission('shifts:update'), asyncHandler(async (req, res) => {
      const { employeeIds = [], departmentId } = req.body;
      if (!employeeIds.length && !departmentId) return respond.badRequest?.(res) ?? respond.ok(res, null, 'Nothing to assign');
      const filter = departmentId ? { department: departmentId, deletedAt: null } : { _id: { $in: employeeIds }, deletedAt: null };
      const result = await Employee.updateMany(filter, { shift: req.params.id });
      return respond.ok(res, { updated: result.modifiedCount }, `Shift assigned to ${result.modifiedCount} employee(s)`);
    }));
  },
});
