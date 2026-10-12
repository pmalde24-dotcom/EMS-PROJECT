'use strict';
const mongoose = require('mongoose');

const payslipSchema = new mongoose.Schema(
  {
    payrollRun: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', required: true, index: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    period: { type: String, required: true, index: true }, // 2026-04
    month: Number,
    year: Number,
    workingDays: { type: Number, default: 0 },
    paidDays: { type: Number, default: 0 },
    lopDays: { type: Number, default: 0 }, // loss of pay (unpaid leave)
    earnings: [{ name: String, amount: Number, type: { type: String, default: 'earning' } }],
    deductions: [{ name: String, amount: Number, type: { type: String, default: 'deduction' } }],
    grossEarnings: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    netPay: { type: Number, default: 0 },
    employerContributions: [{ name: String, amount: Number }],
    ctcMonthly: Number,
    overtimeHours: { type: Number, default: 0 },
    overtimeAmount: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    reimbursementTotal: { type: Number, default: 0 },
    reimbursements: [{ title: String, amount: Number }],
    bankLast4: String,
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'on_hold'], default: 'pending', index: true },
    paidOn: Date,
    paymentReference: String,
    paymentMode: { type: String, enum: ['bank_transfer', 'cheque', 'cash', 'upi'], default: 'bank_transfer' },
    remarks: String,
  },
  { timestamps: true }
);

payslipSchema.index({ employee: 1, period: 1 }, { unique: true });
payslipSchema.index({ period: 1, paymentStatus: 1 });

module.exports = mongoose.model('Payslip', payslipSchema);
