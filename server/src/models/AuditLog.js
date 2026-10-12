'use strict';
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    actorRole: String,
    actorName: String,
    action: { type: String, required: true, index: true }, // e.g. employee.create, leave.approve
    module: { type: String, required: true, index: true },
    targetModel: String,
    targetId: String,
    description: String,
    metadata: { type: mongoose.Schema.Types.Mixed },
    ip: String,
    userAgent: String,
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

auditLogSchema.index({ module: 1, at: -1 });
auditLogSchema.index({ actor: 1, at: -1 });

// Audit logs are append-only: block updates/deletes at the model layer.
['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) => {
  auditLogSchema.pre(op, function (next) {
    next(new Error('Audit logs are immutable and cannot be modified or deleted.'));
  });
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
