'use strict';
const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    code: { type: String, uppercase: true, trim: true },
    startTime: { type: String, required: true }, // "09:30"
    endTime: { type: String, required: true },   // "18:30"
    breakMinutes: { type: Number, default: 60 },
    graceMinutes: { type: Number, default: 15 },
    weeklyOffs: { type: [Number], default: [0, 6] },
    isNightShift: { type: Boolean, default: false },
    rotational: { type: Boolean, default: false },
    rotationPattern: [{ week: Number, shift: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' } }],
    departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
    isActive: { type: Boolean, default: true },
    description: String,
  },
  { timestamps: true }
);

shiftSchema.virtual('durationHours').get(function () {
  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  let diff = toMin(this.endTime) - toMin(this.startTime) - (this.breakMinutes || 0);
  if (diff <= 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
});

module.exports = mongoose.model('Shift', shiftSchema);
