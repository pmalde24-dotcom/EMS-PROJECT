'use strict';
const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 20000 },
    summary: { type: String, maxlength: 300 },
    category: { type: String, enum: ['general', 'hr', 'policy', 'event', 'holiday', 'payroll', 'it', 'celebration', 'urgent'], default: 'general', index: true },
    priority: { type: String, enum: ['low', 'normal', 'high', 'critical'], default: 'normal' },
    audience: {
      type: { type: String, enum: ['all', 'departments', 'designations', 'roles', 'employees'], default: 'all' },
      departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
      designations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Designation' }],
      roles: [{ type: String, enum: ['super_admin', 'hr_admin', 'hr_manager', 'department_manager', 'team_leader', 'employee'] }],
      employees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }],
    },
    attachments: [{ fileName: String, url: String, fileType: String, size: Number }],
    publishAt: { type: Date, default: Date.now, index: true },
    expiresAt: Date,
    status: { type: String, enum: ['draft', 'scheduled', 'published', 'expired', 'archived'], default: 'published', index: true },
    pinned: { type: Boolean, default: false },
    requireAcknowledgement: { type: Boolean, default: false },
    acknowledgements: [{ employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }, at: { type: Date, default: Date.now }, ip: String }],
    readBy: [{ employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }, at: { type: Date, default: Date.now } }],
    views: { type: Number, default: 0 },
    sendEmail: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

announcementSchema.index({ title: 'text', body: 'text' });
announcementSchema.index({ status: 1, publishAt: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);
