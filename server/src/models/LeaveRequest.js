'use strict';
const mongoose = require('mongoose');
const { ENUMS } = require('../config/constants');

const approvalStepSchema = new mongoose.Schema(
  {
    level: { type: Number, required: true },
    role: { type: String, enum: ['manager', 'hr', 'admin'], required: true },
    approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'skipped'], default: 'pending' },
    decidedAt: Date,
    comment: String,
  },
  { _id: true }
);

const leaveRequestSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    leaveType: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true, index: true },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    isHalfDay: { type: Boolean, default: false },
    halfDaySession: { type: String, enum: ['first_half', 'second_half', null], default: null },
    totalDays: { type: Number, required: true, min: 0.5 },
    reason: { type: String, required: [true, 'Reason is required'], maxlength: 1000 },
    contactDuringLeave: String,
    handoverTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    attachments: [{ fileName: String, url: String, fileType: String, size: Number }],
    status: { type: String, enum: ENUMS.leaveStatus, default: 'pending', index: true },
    currentLevel: { type: Number, default: 1 },
    approvals: { type: [approvalStepSchema], default: [] },
    appliedAt: { type: Date, default: Date.now },
    decidedAt: Date,
    rejectionReason: String,
    cancelledAt: Date,
    cancelReason: String,
    year: { type: Number, index: true },
    daysBreakdown: [{ date: Date, dayValue: Number, isHoliday: Boolean, isWeeklyOff: Boolean }],
    auditTrail: [{ at: { type: Date, default: Date.now }, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, action: String, note: String }],
  },
  { timestamps: true }
);

leaveRequestSchema.index({ employee: 1, startDate: -1 });
leaveRequestSchema.index({ status: 1, startDate: 1 });
leaveRequestSchema.index({ employee: 1, status: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
