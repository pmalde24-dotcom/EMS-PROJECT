'use strict';
const mongoose = require('mongoose');
const { ROLE_LIST, ROLE_LABELS, ROLE_PERMISSIONS } = require('../config/constants');

const roleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, enum: ROLE_LIST },
    name: { type: String, required: true },
    description: String,
    permissions: { type: [String], default: [] }, // editable by Super Admin; '*' = all
    isSystem: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    level: { type: Number, default: 5 }, // 1 = highest authority
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

roleSchema.statics.seedDefaults = async function () {
  const ops = ROLE_LIST.map((key, i) =>
    this.updateOne(
      { key },
      { $setOnInsert: { name: ROLE_LABELS[key], permissions: ROLE_PERMISSIONS[key], level: i + 1, isSystem: true } },
      { upsert: true }
    )
  );
  return Promise.all(ops);
};

module.exports = mongoose.model('Role', roleSchema);
