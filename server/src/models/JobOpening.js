'use strict';
const mongoose = require('mongoose');
const { ENUMS } = require('../config/constants');

const jobOpeningSchema = new mongoose.Schema(
  {
    jobCode: { type: String, unique: true, index: true },
    title: { type: String, required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    designation: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation' },
    description: { type: String, required: true },
    responsibilities: [String],
    requiredSkills: [String],
    preferredSkills: [String],
    experienceMin: { type: Number, default: 0 },
    experienceMax: { type: Number, default: 0 },
    qualifications: [String],
    employmentType: { type: String, enum: ENUMS.employmentType, default: 'full_time' },
    workMode: { type: String, enum: ['onsite', 'remote', 'hybrid'], default: 'onsite' },
    location: String,
    openings: { type: Number, default: 1, min: 1 },
    salaryRange: { min: Number, max: Number, currency: { type: String, default: 'INR' }, hideFromCandidate: { type: Boolean, default: false } },
    vacanciesFilled: { type: Number, default: 0 },
    applicationDeadline: Date,
    priority: { type: String, enum: ENUMS.priority, default: 'medium' },
    status: { type: String, enum: ['draft', 'open', 'on_hold', 'closed', 'cancelled'], default: 'open', index: true },
    hiringManager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    recruiter: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    interviewRounds: [{ name: String, order: Number, type: { type: String, enum: ['screening', 'technical', 'managerial', 'hr', 'assignment', 'culture_fit'], default: 'technical' } }],
    publishedAt: Date,
    closedAt: Date,
    closeReason: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

jobOpeningSchema.index({ title: 'text', description: 'text', requiredSkills: 'text' });

jobOpeningSchema.virtual('applicationCount', {
  ref: 'JobApplication', localField: '_id', foreignField: 'jobOpening', count: true,
});

module.exports = mongoose.model('JobOpening', jobOpeningSchema);
