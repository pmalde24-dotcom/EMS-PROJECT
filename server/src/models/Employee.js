'use strict';
const mongoose = require('mongoose');
const { ENUMS } = require('../config/constants');

const fileSchema = new mongoose.Schema(
  {
    fileName: String, fileType: String, size: Number, url: String, path: String,
    publicId: String, storage: { type: String, enum: ['local', 'cloudinary'], default: 'local' },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    category: {
      type: String,
      enum: ['identity', 'education', 'experience', 'contract', 'offer_letter', 'appointment_letter', 'payslip', 'certificate', 'relieving_letter', 'experience_letter', 'other'],
      default: 'other',
      index: true,
    },
    file: fileSchema,
    issuedDate: Date,
    expiryDate: Date,
    verified: { type: Boolean, default: false },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: Date,
    remarks: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    versions: [{ file: fileSchema, uploadedAt: { type: Date, default: Date.now }, uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } }],
  },
  { timestamps: true }
);

const employeeSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    firstName: { type: String, required: [true, 'First name is required'], trim: true, maxlength: 80 },
    lastName: { type: String, required: [true, 'Last name is required'], trim: true, maxlength: 80 },
    email: {
      type: String, required: [true, 'Email is required'], lowercase: true, trim: true,
      match: [/^[\w.+-]+@[\w-]+\.[\w.-]+$/, 'Please provide a valid email address'],
    },
    workEmail: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true, match: [/^[+\d][\d\s-()]{6,20}$/, 'Please provide a valid phone number'] },
    workPhone: String,
    profilePhoto: String,
    dateOfBirth: Date,
    gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'], default: 'prefer_not_to_say' },
    maritalStatus: { type: String, enum: ['single', 'married', 'divorced', 'widowed', 'other'], default: 'single' },
    bloodGroup: String,
    address: {
      line1: String, line2: String, city: String, state: String, country: { type: String, default: 'India' }, pincode: String,
    },
    permanentAddress: { line1: String, line2: String, city: String, state: String, country: String, pincode: String },
    emergencyContact: {
      name: String, relationship: String, phone: String, email: String, address: String,
    },

    joiningDate: { type: Date, required: true, index: true },
    employmentType: { type: String, enum: ENUMS.employmentType, default: 'full_time', index: true },
    employmentStatus: { type: String, enum: ENUMS.employmentStatus, default: 'active', index: true },
    employeeCategory: { type: String, enum: ['permanent', 'probationer', 'contractual', 'intern', 'consultant', 'trainee'], default: 'permanent' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    designation: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation', required: true, index: true },
    reportingManager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null, index: true },
    teamLeader: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    workLocation: { type: String, default: 'Ahmedabad HQ' },
    shift: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', default: null },
    probationEndDate: Date,
    confirmationDate: Date,
    noticePeriodDays: { type: Number, default: 30, min: 0 },
    resignationDate: Date,
    lastWorkingDay: Date,
    exitReason: String,
    exitFeedback: String,

    skills: [{ name: String, level: { type: String, enum: ['beginner', 'intermediate', 'advanced', 'expert'], default: 'intermediate' }, years: Number }],
    qualifications: [{ degree: String, specialization: String, institution: String, year: Number, grade: String }],
    experience: [{ company: String, title: String, from: Date, to: Date, current: Boolean, description: String }],

    bank: {
      accountHolderName: String,
      accountNumber: { type: String, select: false }, // never returned unless explicitly selected
      maskedAccountNumber: String,
      ifsc: String,
      bankName: String,
      branch: String,
      accountType: { type: String, enum: ['savings', 'current', 'salary'], default: 'savings' },
      upiId: String,
      verified: { type: Boolean, default: false },
    },

    documents: { type: [documentSchema], default: [] },
    notes: [{ text: String, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, at: { type: Date, default: Date.now }, visibility: { type: String, enum: ['hr_only', 'manager', 'all'], default: 'hr_only' } }],
    tags: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    history: [{ at: { type: Date, default: Date.now }, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, action: String, changes: mongoose.Schema.Types.Mixed, note: String }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

employeeSchema.virtual('fullName').get(function () { return `${this.firstName} ${this.lastName}`; });
employeeSchema.virtual('age').get(function () {
  if (!this.dateOfBirth) return null;
  return Math.floor((Date.now() - new Date(this.dateOfBirth)) / 3.15576e10);
});
employeeSchema.virtual('tenureYears').get(function () {
  return Math.floor((Date.now() - new Date(this.joiningDate)) / 3.15576e10);
});

// Unique active employee per (email) and index for common searches
employeeSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
employeeSchema.index({ firstName: 1, lastName: 1 });
employeeSchema.index({ department: 1, employmentStatus: 1 });
employeeSchema.index({ joiningDate: -1 });
employeeSchema.index({ designation: 1, employmentStatus: 1 });
employeeSchema.index({ firstName: 'text', lastName: 'text', email: 'text', employeeId: 'text', tags: 'text' });

/** Hides bank account numbers & HR-only notes from unauthorized callers. */
employeeSchema.methods.sanitizeFor = function (user) {
  const obj = this.toObject({ virtuals: true });
  const privileged = ['super_admin', 'hr_admin'].includes(user?.role);
  const isSelf = user?.employee && String(user.employee._id || user.employee) === String(this._id);
  if (!privileged && !isSelf) {
    delete obj.bank;
    obj.notes = (obj.notes || []).filter((n) => n.visibility === 'all');
  } else if (obj.bank) {
    delete obj.bank.accountNumber;
  }
  if (!privileged) obj.notes = (obj.notes || []).filter((n) => n.visibility !== 'hr_only' || isSelf);
  return obj;
};

module.exports = mongoose.model('Employee', employeeSchema);
