'use strict';
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    title: { type: String, required: true },
    body: String,
    type: {
      type: String, index: true,
      enum: ['leave', 'attendance', 'task', 'payroll', 'recruitment', 'document', 'birthday', 'anniversary', 'announcement', 'training', 'asset', 'performance', 'reimbursement', 'system', 'onboarding', 'offboarding'],
      default: 'system',
    },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    link: String,
    refModel: String,
    refId: mongoose.Schema.Types.ObjectId,
    icon: String,
    isRead: { type: Boolean, default: false, index: true },
    readAt: Date,
    emailSent: { type: Boolean, default: false },
    emailSentAt: Date,
    channels: { type: [String], default: ['in_app'] },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
