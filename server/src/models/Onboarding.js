'use strict';
const mongoose = require('mongoose');

const onboardingTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: String,
    category: { type: String, enum: ['documentation', 'it_setup', 'training', 'hr_formalities', 'introduction', 'compliance', 'other'], default: 'other' },
    ownerRole: { type: String, enum: ['hr', 'manager', 'it', 'employee', 'finance', 'admin'], default: 'hr' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dueDate: Date,
    status: { type: String, enum: ['pending', 'in_progress', 'completed', 'not_applicable'], default: 'pending' },
    completedAt: Date,
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    documentUrl: String,
    remarks: String,
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const onboardingSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'OnboardingTemplate' },
    status: { type: String, enum: ['not_started', 'in_progress', 'awaiting_verification', 'completed', 'cancelled'], default: 'in_progress', index: true },
    startDate: Date,
    targetCompletionDate: Date,
    completedAt: Date,
    progressPercent: { type: Number, default: 0, min: 0, max: 100 },
    tasks: { type: [onboardingTaskSchema], default: [] },
    documents: [{
      title: String, category: String, url: String, fileName: String,
      status: { type: String, enum: ['pending', 'submitted', 'verified', 'rejected'], default: 'pending' },
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, verifiedAt: Date, remarks: String,
    }],
    agreements: [{
      title: String, type: { type: String, enum: ['offer_letter', 'appointment_letter', 'nda', 'employment_agreement', 'policy_acknowledgement', 'other'], default: 'other' },
      url: String, acknowledged: { type: Boolean, default: false }, acknowledgedAt: Date, ip: String,
    }],
    assets: [{ asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }, assignedAt: Date, note: String }],
    orientation: [{ title: String, scheduledAt: Date, durationMinutes: Number, presenter: String, location: String, completed: Boolean }],
    buddy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    hrOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    managerOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    notes: String,
    auditTrail: [{ at: { type: Date, default: Date.now }, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, action: String, note: String }],
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

onboardingSchema.pre('save', function (next) {
  const t = this.tasks || [];
  const done = t.filter((x) => ['completed', 'not_applicable'].includes(x.status)).length;
  this.progressPercent = t.length ? Math.round((done / t.length) * 100) : 0;
  if (this.progressPercent === 100 && this.status !== 'completed') { this.status = 'completed'; this.completedAt = new Date(); }
  next();
});

const OnboardingTemplate = mongoose.model('OnboardingTemplate', new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    description: String,
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    designation: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation', default: null },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    tasks: [{ title: String, description: String, category: String, ownerRole: String, dueAfterDays: { type: Number, default: 1 }, order: Number }],
    documentsRequired: [{ title: String, category: String, mandatory: { type: Boolean, default: true } }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
));

module.exports = mongoose.model('Onboarding', onboardingSchema);
module.exports.OnboardingTemplate = OnboardingTemplate;
