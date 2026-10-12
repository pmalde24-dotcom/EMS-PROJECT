'use strict';
const mongoose = require('mongoose');

const reimbursementSchema = new mongoose.Schema(
  {
    claimNo: { type: String, unique: true, index: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    category: {
      type: String, required: true, index: true,
      enum: ['travel', 'accommodation', 'food', 'fuel', 'internet', 'mobile', 'medical', 'training', 'client_entertainment', 'office_supplies', 'relocation', 'other'],
    },
    title: { type: String, required: true },
    description: String,
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'INR' },
    expenseDate: { type: Date, required: true },
    receipts: [{ fileName: String, url: String, fileType: String, size: Number }],
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    status: { type: String, enum: ['draft', 'pending', 'approved', 'rejected', 'paid', 'cancelled'], default: 'pending', index: true },
    currentLevel: { type: Number, default: 1 },
    approvals: [{
      level: Number, role: { type: String, enum: ['manager', 'hr', 'admin', 'finance'] },
      approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
      decidedAt: Date, comment: String,
    }],
    approvedAmount: Number,
    rejectionReason: String,
    paidAt: Date,
    paymentReference: String,
    payrollRun: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun' },
    auditTrail: [{ at: { type: Date, default: Date.now }, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, action: String, note: String }],
  },
  { timestamps: true }
);

reimbursementSchema.index({ employee: 1, createdAt: -1 });
reimbursementSchema.index({ status: 1, expenseDate: -1 });

module.exports = mongoose.model('Reimbursement', reimbursementSchema);
