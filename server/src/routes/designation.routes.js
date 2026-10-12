'use strict';
const express = require('express');
const { z } = require('zod');
const { Designation, Employee } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const validate = require('../middleware/validate');
const { requirePermission } = require('../middleware/auth');
const { crudFactory } = require('../utils/crudFactory');
const { recordAudit } = require('../utils/audit');

const bodySchema = z.object({
  title: z.string().min(2, 'Job title is required'),
  code: z.string().optional(),
  jobLevel: z.enum(['intern', 'junior', 'mid', 'senior', 'lead', 'manager', 'director', 'vp', 'c_level']).optional(),
  grade: z.string().optional(),
  salaryBand: z.object({ min: z.coerce.number().optional(), max: z.coerce.number().optional(), currency: z.string().optional() }).optional(),
  department: z.string().min(1, 'Department is required'),
  description: z.string().optional().or(z.literal('')),
  responsibilities: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
}).passthrough();

module.exports = crudFactory({
  model: Designation,
  module: 'designations',
  name: 'Designation',
  searchFields: ['title', 'code', 'grade'],
  filterFields: ['department', 'jobLevel', 'isActive', 'grade'],
  populate: [{ path: 'department', select: 'name code' }],
  defaultSort: 'title',
  createSchema: bodySchema,
  csvColumns: [{ key: 'title', label: 'Title' }, { key: 'department.name', label: 'Department' }, { key: 'jobLevel', label: 'Level' }, { key: 'grade', label: 'Grade' }],
  extra(router) {
    router.get('/:id/employees', requirePermission('employees:view'), asyncHandler(async (req, res) => {
      const items = await Employee.find({ designation: req.params.id, deletedAt: null })
        .select('firstName lastName employeeId profilePhoto employmentStatus email').sort('firstName').lean();
      return respond.list(res, items, { total: items.length });
    }));
  },
  afterDelete: async (req, doc) => {
    const count = await Employee.countDocuments({ designation: doc._id, deletedAt: null });
    if (count) throw ApiError.conflict(`${count} employee(s) currently hold this designation. Reassign them before deleting.`);
  },
});
