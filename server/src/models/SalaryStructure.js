'use strict';
const mongoose = require('mongoose');

const componentSchema = new mongoose.Schema(
  { name: { type: String, required: true }, amount: { type: Number, default: 0, min: 0 }, percentOfBasic: Number, taxable: { type: Boolean, default: true }, type: { type: String, enum: ['earning', 'deduction', 'employer_contribution'], default: 'earning' } },
  { _id: true }
);

const salaryStructureSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    effectiveFrom: { type: Date, required: true, index: true },
    effectiveTo: { type: Date, default: null },
    ctcAnnual: { type: Number, required: true, min: 0 },
    basic: { type: Number, required: true, min: 0 },
    hra: { type: Number, default: 0 },
    specialAllowance: { type: Number, default: 0 },
    conveyance: { type: Number, default: 0 },
    medicalAllowance: { type: Number, default: 0 },
    lta: { type: Number, default: 0 },
    otherAllowances: { type: [componentSchema], default: [] },
    grossMonthly: { type: Number, default: 0 },
    employerContributions: { type: [componentSchema], default: [] },
    standardDeductions: { type: [componentSchema], default: [] },
    revision: { type: String, enum: ['initial', 'annual', 'promotion', 'increment', 'correction', 'adjustment'], default: 'initial' },
    revisionReason: String,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['active', 'superseded', 'draft'], default: 'active', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

salaryStructureSchema.index({ employee: 1, status: 1, effectiveFrom: -1 });
salaryStructureSchema.pre('save', function (next) {
  this.grossMonthly = ['basic', 'hra', 'specialAllowance', 'conveyance', 'medicalAllowance', 'lta']
    .reduce((s, k) => s + (this[k] || 0), 0)
    + (this.otherAllowances || []).filter((c) => c.type === 'earning').reduce((s, c) => s + (c.amount || 0), 0);
  next();
});

module.exports = mongoose.model('SalaryStructure', salaryStructureSchema);
