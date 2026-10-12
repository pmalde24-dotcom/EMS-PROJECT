'use strict';
const mongoose = require('mongoose');

const trainingProgramSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    code: { type: String, uppercase: true, trim: true },
    description: String,
    category: { type: String, enum: ['technical', 'soft_skills', 'leadership', 'compliance', 'safety', 'product', 'domain', 'other'], default: 'technical', index: true },
    type: { type: String, enum: ['internal', 'external', 'online', 'self_paced', 'workshop', 'certification'], default: 'internal' },
    trainer: { name: String, email: String, organization: String, isInternal: { type: Boolean, default: true }, employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' } },
    durationHours: { type: Number, default: 1 },
    startDate: Date,
    endDate: Date,
    schedule: [{ date: Date, startTime: String, endTime: String, topic: String, venue: String, mode: { type: String, enum: ['in_person', 'online', 'hybrid'], default: 'in_person' } }],
    venue: String,
    meetingLink: String,
    maxParticipants: { type: Number, default: 0 },
    costPerParticipant: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    skillsCovered: [String],
    certificateProvided: { type: Boolean, default: false },
    assessmentRequired: { type: Boolean, default: false },
    passingScore: { type: Number, default: 60 },
    materials: [{ title: String, url: String, fileType: String }],
    departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
    mandatory: { type: Boolean, default: false },
    status: { type: String, enum: ['draft', 'scheduled', 'ongoing', 'completed', 'cancelled'], default: 'scheduled', index: true },
    feedbackForm: [{ question: String, type: { type: String, enum: ['rating', 'text', 'yes_no'], default: 'rating' } }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

trainingProgramSchema.index({ title: 'text', description: 'text', skillsCovered: 'text' });
trainingProgramSchema.virtual('enrolledCount', { ref: 'TrainingAssignment', localField: '_id', foreignField: 'program', count: true });

module.exports = mongoose.model('TrainingProgram', trainingProgramSchema);

const trainingAssignmentSchema = new mongoose.Schema(
  {
    program: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingProgram', required: true, index: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date, default: Date.now },
    dueDate: Date,
    status: { type: String, enum: ['assigned', 'in_progress', 'completed', 'failed', 'no_show', 'cancelled'], default: 'assigned', index: true },
    attendedSessions: [{ date: Date, present: Boolean, minutes: Number }],
    attendancePercent: { type: Number, default: 0 },
    progressPercent: { type: Number, default: 0 },
    score: Number,
    result: { type: String, enum: ['pass', 'fail', 'pending'], default: 'pending' },
    feedback: { overallRating: { type: Number, min: 1, max: 5 }, contentRating: Number, trainerRating: Number, comments: String, wouldRecommend: Boolean, suggestions: String, submittedAt: Date },
    certificate: { issued: { type: Boolean, default: false }, issuedAt: Date, certificateNo: String, url: String, validUntil: Date },
    skillsAcquired: [String],
    completedAt: Date,
    notes: String,
  },
  { timestamps: true }
);

trainingAssignmentSchema.index({ program: 1, employee: 1 }, { unique: true });

module.exports.TrainingAssignment = mongoose.model('TrainingAssignment', trainingAssignmentSchema);
