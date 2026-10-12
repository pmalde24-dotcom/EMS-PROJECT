'use strict';
const { z } = require('zod');
const { LeaveType, LeaveBalance } = require('../models');
const { crudFactory } = require('../utils/crudFactory');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const { requirePermission } = require('../middleware/auth');
const ApiError = require('../utils/ApiError');

const schema = z.object({
  name: z.string().min(2), code: z.string().min(1), description: z.string().optional(),
  annualQuota: z.coerce.number().min(0).max(365).optional(),
  accrualType: z.enum(['yearly', 'monthly', 'quarterly', 'none']).optional(),
  paid: z.boolean().optional(), carryForward: z.boolean().optional(), maxCarryForward: z.coerce.number().min(0).optional(),
  encashable: z.boolean().optional(), allowHalfDay: z.boolean().optional(),
  requiresDocument: z.boolean().optional(), requiresDocumentAfterDays: z.coerce.number().optional(),
  maxConsecutiveDays: z.coerce.number().optional(), minNoticeDays: z.coerce.number().optional(),
  maxPerMonth: z.coerce.number().optional(), genderRestriction: z.enum(['none', 'male', 'female']).optional(),
  applicableTo: z.array(z.string()).optional(), approvalLevels: z.coerce.number().min(1).max(3).optional(),
  color: z.string().optional(), isActive: z.boolean().optional(),
}).passthrough();

module.exports = crudFactory({
  model: LeaveType,
  module: 'leave',
  name: 'Leave Type',
  searchFields: ['name', 'code'],
  filterFields: ['isActive', 'paid'],
  defaultSort: 'name',
  createSchema: schema,
  softDelete: false,
  extra(router) {
    router.delete('/:id', requirePermission('leave:delete'), asyncHandler(async (req, res) => {
      const used = await LeaveBalance.countDocuments({ leaveType: req.params.id, $or: [{ used: { $gt: 0 } }, { pending: { $gt: 0 } }] });
      const type = await LeaveType.findById(req.params.id);
      if (!type) throw ApiError.notFound('Leave type not found');
      if (used) throw ApiError.conflict(`${used} employees have used/pending balance for this leave type. Deactivate it instead of deleting to preserve history.`);
      type.isActive = false;
      await type.save();
      await type.deleteOne();
      return respond.ok(res, { _id: type._id }, 'Leave type deleted');
    }));
  },
});
