'use strict';
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLE_LIST } = require('../config/constants');

const loginActivitySchema = new mongoose.Schema(
  { at: { type: Date, default: Date.now }, ip: String, userAgent: String, success: Boolean, reason: String },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 120 },
    email: {
      type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true,
      match: [/^[\w.+-]+@[\w-]+\.[\w.-]+$/, 'Please provide a valid email address'],
      index: true,
    },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ROLE_LIST, default: 'employee', required: true, index: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
    extraPermissions: { type: [String], default: [] }, // per-user grants on top of role defaults
    revokedPermissions: { type: [String], default: [] }, // per-user deny overrides
    isActive: { type: Boolean, default: true, index: true },
    isEmailVerified: { type: Boolean, default: false },
    emailVerifyToken: { type: String, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    passwordChangedAt: Date,
    lastLoginAt: Date,
    loginCount: { type: Number, default: 0 },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
    twoFactorEnabled: { type: Boolean, default: false },
    notificationPrefs: {
      email: { type: Boolean, default: true },
      inApp: { type: Boolean, default: true },
      leave: { type: Boolean, default: true },
      tasks: { type: Boolean, default: true },
      payroll: { type: Boolean, default: true },
      announcements: { type: Boolean, default: true },
      reminders: { type: Boolean, default: true },
    },
    loginActivity: { type: [loginActivitySchema], default: [], select: false },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.password; delete ret.loginActivity; delete ret.failedLoginAttempts;
        delete ret.emailVerifyToken; delete ret.passwordResetToken; delete ret.passwordResetExpires;
        delete ret.__v; delete ret.id;
        return ret;
      },
    },
  }
);

userSchema.virtual('permissions').get(function () {
  const { ROLE_PERMISSIONS } = require('../config/constants');
  const rolePerms = ROLE_PERMISSIONS[this.role] || [];
  if (rolePerms.includes('*')) return ['*'];
  const set = new Set([...rolePerms, ...(this.extraPermissions || [])]);
  (this.revokedPermissions || []).forEach((p) => set.delete(p));
  return Array.from(set);
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) this.passwordChangedAt = new Date();
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};
userSchema.methods.isLocked = function () {
  return !!(this.lockedUntil && this.lockedUntil > Date.now());
};

userSchema.statics.findByCredentials = function (email) {
  return this.findOne({ email: String(email).toLowerCase().trim(), deletedAt: null }).select('+password +loginActivity +failedLoginAttempts +lockedUntil');
};

module.exports = mongoose.model('User', userSchema);
