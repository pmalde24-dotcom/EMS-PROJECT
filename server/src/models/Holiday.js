'use strict';
const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    date: { type: Date, required: true, index: true },
    year: { type: Number, required: true, index: true },
    type: { type: String, enum: ['public', 'regional', 'company', 'optional', 'restricted'], default: 'public', index: true },
    description: String,
    region: String,
    departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
    isRecurring: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

holidaySchema.index({ date: 1, region: 1 }, { unique: true, name: 'unique_holiday_per_region' });

module.exports = mongoose.model('Holiday', holidaySchema);
