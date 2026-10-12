'use strict';
const mongoose = require('mongoose');
const { ENUMS } = require('../config/constants');

const timeEntrySchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    hours: { type: Number, required: true, min: 0.25, max: 24 },
    description: { type: String, required: true, maxlength: 500 },
    billable: { type: Boolean, default: true },
    overtime: { type: Boolean, default: false },
  },
  { _id: true }
);

const timesheetSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    weekStart: { type: Date, required: true, index: true }, // Monday
    weekEnd: { type: Date, required: true },
    isoWeek: String,
    year: { type: Number, index: true },
    entries: { type: [timeEntrySchema], default: [] },
    totalHours: { type: Number, default: 0 },
    billableHours: { type: Number, default: 0 },
    nonBillableHours: { type: Number, default: 0 },
    overtimeHours: { type: Number, default: 0 },
    status: { type: String, enum: ENUMS.timesheetStatus, default: 'draft', index: true },
    submittedAt: Date,
    approver: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    decidedAt: Date,
    rejectionReason: String,
    approverComment: String,
    resubmissionCount: { type: Number, default: 0 },
    auditTrail: [{ at: { type: Date, default: Date.now }, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, action: String, note: String }],
  },
  { timestamps: true }
);

timesheetSchema.index({ employee: 1, weekStart: 1 }, { unique: true, partialFilterExpression: { status: { $ne: 'rejected' } } });

timesheetSchema.pre('save', function (next) {
  const e = this.entries || [];
  this.totalHours = round(e.reduce((s, x) => s + (x.hours || 0), 0));
  this.billableHours = round(e.filter((x) => x.billable).reduce((s, x) => s + (x.hours || 0), 0));
  this.nonBillableHours = round(e.filter((x) => !x.billable).reduce((s, x) => s + (x.hours || 0), 0));
  this.overtimeHours = round(e.filter((x) => x.overtime).reduce((s, x) => s + (x.hours || 0), 0));
  next();
});
const round = (n) => Math.round(n * 100) / 100;

module.exports = mongoose.model('Timesheet', timesheetSchema);
