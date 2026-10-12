'use strict';
const mongoose = require('mongoose');
const { ENUMS } = require('../config/constants');

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    code: { type: String, uppercase: true, trim: true, index: true },
    description: String,
    client: String,
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    team: [{ employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }, role: String, allocatedPercent: { type: Number, default: 100 }, addedAt: { type: Date, default: Date.now } }],
    startDate: Date,
    endDate: Date,
    actualEndDate: Date,
    status: { type: String, enum: ['planning', 'active', 'on_hold', 'completed', 'cancelled'], default: 'active', index: true },
    priority: { type: String, enum: ENUMS.priority, default: 'medium' },
    budget: { amount: { type: Number, default: 0 }, spent: { type: Number, default: 0 }, currency: { type: String, default: 'INR' } },
    billable: { type: Boolean, default: true },
    tags: [String],
    attachments: [{ fileName: String, url: String, fileType: String, size: Number }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

projectSchema.index({ name: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Project', projectSchema);
