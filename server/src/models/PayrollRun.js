'use strict';
const mongoose = require('mongoose');
const { ENUMS } = require('../config/constants');

const payrollRunSchema = new mongoose.Schema(
  {
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    period: { type: String, required: true, unique: true, index: true }, // "2026-04"
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null }, // null = company-wide
    status: { type: String, enum: ENUMS.payrollStatus, default: 'draft', index: true },
    totalEmployees: { type: Number, default: 0 },
    totalGross: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    totalNet: { type: Number, default: 0 },
    totalEmployerCost: { type: Number, default: 0 },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    generatedAt: Date,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    processedAt: Date,
    paidAt: Date,
    locked: { type: Boolean, default: false },
    lockedAt: Date,
    notes: String,
    auditTrail: [{ at: { type: Date, default: Date.now }, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, action: String, note: String }],
  },
  { timestamps: true }
);

payrollRunSchema.index({ year: -1, month: -1 });

module.exports = mongoose.model('PayrollRun', payrollRunSchema);
