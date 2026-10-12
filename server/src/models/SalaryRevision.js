'use strict';
const mongoose = require('mongoose');

const salaryRevisionSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    previousCtc: { type: Number, default: 0 },
    newCtc: { type: Number, required: true },
    previousGross: { type: Number, default: 0 },
    newGross: { type: Number, required: true },
    incrementPercent: { type: Number, default: 0 },
    effectiveFrom: { type: Date, required: true },
    revisionType: { type: String, enum: ['annual', 'promotion', 'increment', 'correction', 'adjustment', 'joining'], default: 'annual' },
    reason: String,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'applied'], default: 'applied' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SalaryRevision', salaryRevisionSchema);
