'use strict';
const express = require('express');
const { z } = require('zod');
const { Department, Employee, Designation, JobOpening } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const validate = require('../middleware/validate');
const { requirePermission } = require('../middleware/auth');
const { crudFactory } = require('../utils/crudFactory');
const { recordAudit } = require('../utils/audit');

const bodySchema = z.object({
  name: z.string().min(2, 'Department name is required'),
  code: z.string().min(1),
  description: z.string().max(1000).optional().or(z.literal('')),
  head: z.string().optional().nullable().or(z.literal('')),
  parentDepartment: z.string().optional().nullable().or(z.literal('')),
  budget: z.object({ annual: z.coerce.number().min(0).optional(), spent: z.coerce.number().min(0).optional(), currency: z.string().optional() }).optional(),
  location: z.string().optional(),
  costCenter: z.string().optional(),
  isActive: z.boolean().optional(),
}).passthrough();

const router = crudFactory({
  model: Department,
  module: 'departments',
  name: 'Department',
  searchFields: ['name', 'code', 'description', 'costCenter'],
  filterFields: ['isActive', 'parentDepartment', 'location'],
  defaultSort: 'name',
  createSchema: bodySchema,
  csvColumns: [
    { key: 'code', label: 'Code' }, { key: 'name', label: 'Department' },
    { key: 'location', label: 'Location' }, { key: 'costCenter', label: 'Cost Center' },
    { key: 'budget.annual', label: 'Annual Budget' }, { key: 'isActive', label: 'Active' },
  ],
  extra(router) {
    // Department overview: head, employee counts, designations, open positions
    router.get('/:id/overview', requirePermission('departments:view'), asyncHandler(async (req, res) => {
      const dept = await Department.findById(req.params.id).populate('head', 'firstName lastName employeeId profilePhoto').lean();
      if (!dept) throw ApiError.notFound('Department not found');
      const [byStatus, designations, openings, recentJoiners, employees] = await Promise.all([
        Employee.aggregate([{ $match: { department: dept._id, deletedAt: null } }, { $group: { _id: '$employmentStatus', count: { $sum: 1 } } }]),
        Designation.find({ department: dept._id, deletedAt: null }).select('title jobLevel isActive').lean(),
        JobOpening.find({ department: dept._id, deletedAt: null, status: 'open' }).select('title openings employmentType').lean(),
        Employee.find({ department: dept._id, deletedAt: null }).sort('-joiningDate').limit(5).select('firstName lastName employeeId joiningDate profilePhoto').lean(),
        Employee.countDocuments({ department: dept._id, deletedAt: null }),
      ]);
      return respond.ok(res, { department: dept, employeeCount: employees, byStatus, designations, openPositions: openings, recentJoiners });
    }));

    router.get('/:id/employees', requirePermission('employees:view'), asyncHandler(async (req, res) => {
      const items = await Employee.find({ department: req.params.id, deletedAt: null })
        .select('firstName lastName employeeId profilePhoto email phone designation employmentStatus joiningDate workLocation')
        .populate('designation', 'title jobLevel')
        .sort('firstName').lean();
      return respond.list(res, items, { total: items.length });
    }));

    router.post('/:id/assign-head', requirePermission('departments:update'), validate({ body: z.object({ employeeId: z.string().nullable() }) }),
      asyncHandler(async (req, res) => {
        const dept = await Department.findById(req.params.id);
        if (!dept) throw ApiError.notFound('Department not found');
        if (req.body.employeeId) {
          const emp = await Employee.findById(req.body.employeeId);
          if (!emp) throw ApiError.badRequest('Employee not found');
          dept.head = emp._id;
        } else dept.head = null;
        await dept.save();
        await recordAudit(req, { action: 'department.assign_head', module: 'departments', targetId: dept._id, description: `Set head of ${dept.name}` });
        return respond.ok(res, dept, 'Department head updated');
      })
    );

    router.post('/:id/budget', requirePermission('departments:update'), asyncHandler(async (req, res) => {
      const dept = await Department.findById(req.params.id);
      if (!dept) throw ApiError.notFound('Department not found');
      dept.budget = { ...dept.budget.toObject?.() ?? dept.budget, ...req.body };
      await dept.save();
      await recordAudit(req, { action: 'department.budget_update', module: 'departments', targetId: dept._id, description: `Updated budget for ${dept.name}`, metadata: req.body });
      return respond.ok(res, dept.budget, 'Budget updated');
    }));
  },
});

// Guard rails: block delete when referenced, unless reassignment target is supplied
const baseDelete = router.stack.filter((l) => l.route?.path === '/:id' && l.route.methods.delete)[0];
router.stack = router.stack.filter((l) => !(l.route?.path === '/:id' && l.route.methods.delete));
router.delete('/:id', requirePermission('departments:delete'), asyncHandler(async (req, res) => {
  const dept = await Department.findById(req.params.id);
  if (!dept || dept.deletedAt) throw ApiError.notFound('Department not found');
  const [employeeCount, designationCount, openingCount] = await Promise.all([
    Employee.countDocuments({ department: dept._id, deletedAt: null }),
    Designation.countDocuments({ department: dept._id, deletedAt: null }),
    JobOpening.countDocuments({ department: dept._id, deletedAt: null, status: 'open' }),
  ]);
  if (employeeCount || designationCount || openingCount) {
    const target = req.query.reassignTo || req.body?.reassignTo;
    if (!target) {
      throw ApiError.conflict(
        `This department is referenced by ${employeeCount} employee(s), ${designationCount} designation(s) and ${openingCount} open position(s). ` +
        `Reassign these records first or pass ?reassignTo=<departmentId> to move them automatically.`
      );
    }
    if (String(target) === String(dept._id)) throw ApiError.badRequest('Reassignment target must be a different department');
    const targetDept = await Department.findOne({ _id: target, deletedAt: null });
    if (!targetDept) throw ApiError.badRequest('Reassignment target department not found');
    const [empRes, desRes, jobRes] = await Promise.all([
      Employee.updateMany({ department: dept._id }, { department: targetDept._id }),
      Designation.updateMany({ department: dept._id }, { department: targetDept._id }),
      JobOpening.updateMany({ department: dept._id }, { department: targetDept._id }),
    ]);
    await recordAudit(req, { action: 'department.reassign', module: 'departments', targetId: dept._id, description: `Reassigned ${empRes.modifiedCount} employees, ${desRes.modifiedCount} designations, ${jobRes.modifiedCount} openings from ${dept.name} to ${targetDept.name}`, severity: 'critical' });
  }
  dept.deletedAt = new Date(); dept.isActive = false;
  await dept.save();
  await recordAudit(req, { action: 'department.delete', module: 'departments', targetId: dept._id, description: `Deleted department ${dept.name}`, severity: 'critical' });
  return respond.ok(res, { _id: dept._id }, 'Department deleted');
}));
void baseDelete;

module.exports = router;
