'use strict';
const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    title: { type: String, required: true },
    description: String,
    type: { type: String, enum: ['okr', 'kpi', 'individual', 'team', 'development'], default: 'individual', index: true },
    category: { type: String, enum: ['business', 'technical', 'leadership', 'customer', 'process', 'learning', 'other'], default: 'business' },
    period: { type: String, index: true }, // FY2026-H1
    startDate: Date,
    dueDate: Date,
    keyResults: [{ title: String, target: Number, current: { type: Number, default: 0 }, unit: String, status: { type: String, enum: ['not_started', 'on_track', 'at_risk', 'off_track', 'achieved'], default: 'not_started' } }],
    weight: { type: Number, default: 1 },
    progressPercent: { type: Number, default: 0, min: 0, max: 100 },
    status: { type: String, enum: ['not_started', 'in_progress', 'achieved', 'partially_achieved', 'missed', 'cancelled'], default: 'not_started', index: true },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    reviewCycle: { type: mongoose.Schema.Types.ObjectId, ref: 'PerformanceReview' },
    managerComments: String,
    employeeComments: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedAt: Date,
    auditTrail: [{ at: { type: Date, default: Date.now }, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, action: String, note: String }],
  },
  { timestamps: true }
);

goalSchema.pre('save', function (next) {
  const kr = this.keyResults || [];
  if (kr.length) {
    const pct = kr.reduce((s, k) => s + (k.target ? Math.min(100, (k.current / k.target) * 100) : 0), 0) / kr.length;
    this.progressPercent = Math.round(pct);
  }
  next();
});

module.exports = mongoose.model('Goal', goalSchema);

const PerformancePlan = mongoose.model('PerformancePlan', new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    review: { type: mongoose.Schema.Types.ObjectId, ref: 'PerformanceReview' },
    type: { type: String, enum: ['improvement_plan', 'development_plan', 'probation_extension'], default: 'improvement_plan' },
    title: String,
    reason: { type: String, required: true },
    objectives: [{ title: String, successCriteria: String, status: { type: String, enum: ['pending', 'met', 'not_met'], default: 'pending' }, note: String }],
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    reviewDates: [Date],
    mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    hrOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    status: { type: String, enum: ['active', 'completed', 'extended', 'failed', 'cancelled'], default: 'active', index: true },
    outcome: String,
  },
  { timestamps: true }
));
module.exports.PerformancePlan = PerformancePlan;
