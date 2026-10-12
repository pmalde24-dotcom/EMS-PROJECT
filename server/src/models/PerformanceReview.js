'use strict';
const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema(
  { competency: String, name: String, rating: { type: Number, min: 1, max: 5 }, weight: { type: Number, default: 1 }, comment: String },
  { _id: false }
);

const performanceReviewSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    cycle: { type: String, required: true, index: true }, // "FY2026-H1" / "Q1-2026"
    cycleType: { type: String, enum: ['quarterly', 'half_yearly', 'annual', 'probation', 'special'], default: 'annual' },
    periodStart: Date,
    periodEnd: Date,
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'PerformanceTemplate' },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    hrReviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    ratingScale: { min: { type: Number, default: 1 }, max: { type: Number, default: 5 }, labels: { type: [String], default: ['Needs Improvement', 'Below Expectations', 'Meets Expectations', 'Exceeds Expectations', 'Outstanding'] } },
    selfAssessment: {
      submitted: { type: Boolean, default: false }, submittedAt: Date,
      ratings: { type: [ratingSchema], default: [] }, comments: String, achievements: String, challenges: String,
      overallSelfRating: Number, goalsReview: String,
    },
    managerAssessment: {
      submitted: { type: Boolean, default: false }, submittedAt: Date,
      ratings: { type: [ratingSchema], default: [] }, comments: String, strengths: String, improvements: String,
      overallRating: Number, promotionRecommended: { type: Boolean, default: false }, recommendedDesignation: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation' },
      incrementRecommended: { type: Number, default: 0 },
    },
    hrAssessment: { submitted: { type: Boolean, default: false }, submittedAt: Date, comments: String, finalRating: Number, approved: { type: Boolean, default: false }, calibratedRating: Number },
    finalRating: { type: Number },
    finalComments: String,
    status: { type: String, enum: ['draft', 'self_pending', 'manager_pending', 'hr_pending', 'completed', 'released', 'cancelled'], default: 'draft', index: true },
    releasedAt: Date,
    promotionEligible: { type: Boolean, default: false },
    hikePercent: Number,
    auditTrail: [{ at: { type: Date, default: Date.now }, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, action: String, note: String }],
  },
  { timestamps: true }
);

performanceReviewSchema.index({ employee: 1, cycle: 1 }, { unique: true });

module.exports = mongoose.model('PerformanceReview', performanceReviewSchema);

const PerformanceTemplate = mongoose.model('PerformanceTemplate', new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    cycleType: { type: String, enum: ['quarterly', 'half_yearly', 'annual', 'probation', 'special'], default: 'annual' },
    description: String,
    competencies: [{ name: String, description: String, weight: { type: Number, default: 1 } }],
    ratingScale: { min: Number, max: Number, labels: [String] },
    includeSelfAssessment: { type: Boolean, default: true },
    includeManagerAssessment: { type: Boolean, default: true },
    includeHRReview: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
));
module.exports.PerformanceTemplate = PerformanceTemplate;
