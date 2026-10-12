'use strict';
const mongoose = require('mongoose');

const leaveTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    code: { type: String, required: true, uppercase: true, unique: true },
    description: String,
    annualQuota: { type: Number, default: 12, min: 0 },
    accrualType: { type: String, enum: ['yearly', 'monthly', 'quarterly', 'none'], default: 'yearly' },
    paid: { type: Boolean, default: true },
    carryForward: { type: Boolean, default: false },
    maxCarryForward: { type: Number, default: 0 },
    encashable: { type: Boolean, default: false },
    allowHalfDay: { type: Boolean, default: true },
    requiresDocument: { type: Boolean, default: false },
    requiresDocumentAfterDays: { type: Number, default: 0 },
    maxConsecutiveDays: { type: Number, default: 30 },
    minNoticeDays: { type: Number, default: 0 },
    maxPerMonth: { type: Number, default: 0 }, // 0 = unlimited
    genderRestriction: { type: String, enum: ['none', 'male', 'female'], default: 'none' },
    applicableTo: { type: [String], default: [] }, // employment types; empty = all
    approvalLevels: { type: Number, default: 2, min: 1, max: 3 }, // manager → HR (→ admin)
    color: { type: String, default: '#6366f1' },
    isActive: { type: Boolean, default: true, index: true },
    isSystem: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LeaveType', leaveTypeSchema);
