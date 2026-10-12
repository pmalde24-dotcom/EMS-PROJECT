'use strict';
const mongoose = require('mongoose');

const exitTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    category: { type: String, enum: ['clearance', 'asset_return', 'access_revocation', 'handover', 'documentation', 'finance', 'hr', 'other'], default: 'other' },
    ownerRole: { type: String, enum: ['hr', 'manager', 'it', 'employee', 'finance', 'admin'], default: 'hr' },
    status: { type: String, enum: ['pending', 'in_progress', 'completed', 'waived'], default: 'pending' },
    completedAt: Date, completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, remarks: String,
  },
  { timestamps: true }
);

const offboardingSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    resignationDate: { type: Date, required: true },
    lastWorkingDay: { type: Date, required: true, index: true },
    noticePeriodDays: { type: Number, default: 30 },
    noticeServedDays: { type: Number, default: 0 },
    noticeShortfallDays: { type: Number, default: 0 },
    reason: {
      type: String, required: true,
      enum: ['better_opportunity', 'higher_studies', 'relocation', 'health', 'family', 'compensation', 'work_environment', 'career_change', 'termination', 'retirement', 'absconding', 'other'],
    },
    reasonDetails: String,
    status: { type: String, enum: ['submitted', 'approved', 'rejected', 'in_progress', 'completed', 'withdrawn'], default: 'submitted', index: true },
    approvals: [{ level: Number, role: String, approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }, decidedAt: Date, comment: String }],
    exitInterview: {
      scheduledAt: Date, conductedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, conductedAt: Date,
      mode: { type: String, enum: ['in_person', 'video', 'phone', 'form'], default: 'form' },
      ratings: { workEnvironment: Number, management: Number, compensation: Number, growth: Number, workLifeBalance: Number },
      feedback: String, suggestions: String, wouldRecommend: { type: Boolean }, rehireEligible: { type: Boolean },
      notes: String,
    },
    tasks: { type: [exitTaskSchema], default: [] },
    assetsReturned: [{ asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }, returnedAt: Date, condition: String, notes: String, isReturned: Boolean }],
    accessRevoked: { email: Boolean, system: Boolean, building: Boolean, vpn: Boolean, revokedAt: Date, revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } },
    reconciliation: {
      leaveBalanceDays: { type: Number, default: 0 }, leaveEncashmentAmount: { type: Number, default: 0 },
      pendingSalaryDays: { type: Number, default: 0 }, pendingSalaryAmount: { type: Number, default: 0 },
      recoveries: { type: Number, default: 0 }, bonusPayable: { type: Number, default: 0 },
      noticePeriodRecovery: { type: Number, default: 0 }, gratuityAmount: { type: Number, default: 0 },
      totalSettlement: { type: Number, default: 0 }, notes: String,
    },
    finalSettlement: {
      status: { type: String, enum: ['pending', 'calculated', 'approved', 'paid'], default: 'pending' },
      calculatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, calculatedAt: Date,
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, approvedAt: Date,
      paidOn: Date, paymentReference: String, lines: [{ name: String, type: { type: String, enum: ['earning', 'deduction'] }, amount: Number }],
      netAmount: { type: Number, default: 0 },
    },
    documents: [{ title: String, type: { type: String, enum: ['experience_letter', 'relieving_letter', 'settlement_letter', 'other'], default: 'other' }, url: String, generatedAt: Date }],
    auditTrail: [{ at: { type: Date, default: Date.now }, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, action: String, note: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Offboarding', offboardingSchema);
