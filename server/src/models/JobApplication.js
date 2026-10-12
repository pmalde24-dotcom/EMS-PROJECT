'use strict';
const mongoose = require('mongoose');
const { ENUMS } = require('../config/constants');

const interviewSchema = new mongoose.Schema(
  {
    round: { type: Number, default: 1 },
    name: String,
    type: { type: String, enum: ['screening', 'technical', 'managerial', 'hr', 'assignment', 'culture_fit'], default: 'technical' },
    scheduledAt: Date,
    durationMinutes: { type: Number, default: 45 },
    mode: { type: String, enum: ['in_person', 'video', 'phone'], default: 'video' },
    meetingLink: String,
    venue: String,
    interviewers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }],
    status: { type: String, enum: ['scheduled', 'completed', 'cancelled', 'no_show', 'rescheduled'], default: 'scheduled' },
    feedback: [{
      interviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
      ratings: { technical: Number, communication: Number, problemSolving: Number, cultureFit: Number },
      overallRating: { type: Number, min: 1, max: 5 },
      strengths: String, concerns: String, recommendation: { type: String, enum: ['strong_hire', 'hire', 'hold', 'no_hire'], default: 'hold' },
      comments: String, submittedAt: Date,
    }],
    result: { type: String, enum: ['pass', 'fail', 'on_hold'], default: null },
  },
  { timestamps: true }
);

const jobApplicationSchema = new mongoose.Schema(
  {
    applicationNo: { type: String, unique: true, index: true },
    jobOpening: { type: mongoose.Schema.Types.ObjectId, ref: 'JobOpening', required: true, index: true },
    candidate: {
      firstName: { type: String, required: true }, lastName: { type: String, required: true },
      email: { type: String, required: true, lowercase: true }, phone: String,
      dateOfBirth: Date, gender: String, currentCompany: String, currentDesignation: String,
      totalExperience: { type: Number, default: 0 }, currentCtc: Number, expectedCtc: Number,
      noticePeriodDays: Number, currentLocation: String, preferredLocation: String,
      linkedIn: String, portfolio: String,
    },
    resume: { fileName: String, url: String, fileType: String, size: Number },
    coverLetter: String,
    source: { type: String, enum: ['careers_page', 'referral', 'linkedin', 'job_portal', 'agency', 'walk_in', 'campus', 'other'], default: 'careers_page' },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    skills: [String],
    qualifications: [{ degree: String, institution: String, year: Number, grade: String }],
    experience: [{ company: String, title: String, from: Date, to: Date, description: String }],
    stage: { type: String, enum: ENUMS.applicationStage, default: 'applied', index: true },
    stageHistory: [{ stage: String, at: { type: Date, default: Date.now }, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, note: String }],
    screening: { score: Number, notes: String, screenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, screenedAt: Date, qualified: Boolean },
    interviews: { type: [interviewSchema], default: [] },
    offer: {
      status: { type: String, enum: ['not_sent', 'sent', 'accepted', 'declined', 'expired', 'revoked'], default: 'not_sent' },
      ctc: Number, joiningDate: Date, sentAt: Date, respondedAt: Date, expiryDate: Date,
      letterUrl: String, notes: String, designation: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation' },
    },
    rejectionReason: String,
    rejectionStage: String,
    rating: { type: Number, min: 1, max: 5 },
    tags: [String],
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    convertedEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    appliedAt: { type: Date, default: Date.now, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

jobApplicationSchema.index({ 'candidate.email': 1, jobOpening: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
jobApplicationSchema.index({ stage: 1, appliedAt: -1 });

jobApplicationSchema.virtual('candidateName').get(function () {
  return this.candidate ? `${this.candidate.firstName} ${this.candidate.lastName}` : '';
});

module.exports = mongoose.model('JobApplication', jobApplicationSchema);
