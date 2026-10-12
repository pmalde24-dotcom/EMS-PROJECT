'use strict';
const mongoose = require('mongoose');

const designationSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Job title is required'], trim: true },
    code: { type: String, uppercase: true, trim: true },
    jobLevel: { type: String, enum: ['intern', 'junior', 'mid', 'senior', 'lead', 'manager', 'director', 'vp', 'c_level'], default: 'mid', index: true },
    grade: { type: String, trim: true },
    salaryBand: { min: { type: Number, default: 0 }, max: { type: Number, default: 0 }, currency: { type: String, default: 'INR' } },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true },
    description: { type: String, maxlength: 2000 },
    responsibilities: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

designationSchema.index({ title: 1, department: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

module.exports = mongoose.model('Designation', designationSchema);
