'use strict';
const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Department name is required'], trim: true, unique: true },
    code: { type: String, required: true, uppercase: true, trim: true, unique: true },
    description: { type: String, maxlength: 1000 },
    head: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    parentDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    budget: {
      annual: { type: Number, default: 0, min: 0 },
      currency: { type: String, default: 'INR' },
      spent: { type: Number, default: 0, min: 0 },
    },
    location: String,
    costCenter: String,
    isActive: { type: Boolean, default: true, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

departmentSchema.index({ name: 'text', code: 'text', description: 'text' });

departmentSchema.virtual('employeeCount', {
  ref: 'Employee', localField: '_id', foreignField: 'department', count: true,
  match: { deletedAt: null, employmentStatus: { $nin: ['terminated', 'resigned', 'retired'] } },
});

module.exports = mongoose.model('Department', departmentSchema);
