'use strict';
const mongoose = require('mongoose');
const { ENUMS } = require('../config/constants');

const punchSchema = new mongoose.Schema(
  { at: { type: Date, required: true }, type: { type: String, enum: ['in', 'out', 'break_start', 'break_end'], required: true }, ip: String, location: { lat: Number, lng: Number, address: String }, source: { type: String, enum: ['web', 'mobile', 'biometric', 'import', 'manual'], default: 'web' } },
  { _id: false }
);

const correctionSchema = new mongoose.Schema(
  {
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestedAt: { type: Date, default: Date.now },
    reason: { type: String, required: true },
    proposed: { checkIn: Date, checkOut: Date, status: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date,
    decisionNote: String,
  },
  { _id: true }
);

const attendanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    date: { type: Date, required: true, index: true }, // normalized to UTC midnight of local day
    shift: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
    checkIn: Date,
    checkOut: Date,
    breakMinutes: { type: Number, default: 0 },
    punches: { type: [punchSchema], default: [] },
    workedMinutes: { type: Number, default: 0 },
    overtimeMinutes: { type: Number, default: 0 },
    lateMinutes: { type: Number, default: 0 },
    earlyExitMinutes: { type: Number, default: 0 },
    status: { type: String, enum: ENUMS.attendanceStatus, default: 'present', index: true },
    isLate: { type: Boolean, default: false },
    isEarlyExit: { type: Boolean, default: false },
    isOvertime: { type: Boolean, default: false },
    workFromHome: { type: Boolean, default: false },
    location: { lat: Number, lng: Number, address: String, ip: String },
    source: { type: String, enum: ['web', 'mobile', 'biometric', 'import', 'manual'], default: 'web' },
    remarks: String,
    corrections: { type: [correctionSchema], default: [] },
    adjustedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    adjustmentReason: String,
    locked: { type: Boolean, default: false }, // true once payroll for the period is processed
    auditTrail: [{ at: { type: Date, default: Date.now }, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, action: String, before: mongoose.Schema.Types.Mixed, after: mongoose.Schema.Types.Mixed, note: String }],
  },
  { timestamps: true }
);

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1, status: 1 });
attendanceSchema.index({ employee: 1, date: -1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
