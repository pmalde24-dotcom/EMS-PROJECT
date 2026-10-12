'use strict';
const mongoose = require('mongoose');
const { ENUMS } = require('../config/constants');

const assetSchema = new mongoose.Schema(
  {
    assetId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    category: {
      type: String, required: true, index: true,
      enum: ['laptop', 'desktop', 'monitor', 'mobile', 'tablet', 'keyboard', 'mouse', 'headset', 'printer', 'access_card', 'sim_card', 'furniture', 'vehicle', 'network_device', 'software_license', 'other'],
    },
    brand: String,
    model: String,
    serialNumber: { type: String, trim: true, index: true },
    imei: String,
    specifications: String,
    purchaseDate: Date,
    purchasePrice: { type: Number, default: 0 },
    vendor: String,
    invoiceNumber: String,
    warrantyExpiry: { type: Date, index: true },
    amcExpiry: Date,
    insuranceExpiry: Date,
    condition: { type: String, enum: ['new', 'good', 'fair', 'poor', 'damaged'], default: 'good' },
    status: { type: String, enum: ENUMS.assetStatus, default: 'available', index: true },
    currentHolder: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null, index: true },
    assignedAt: Date,
    location: String,
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    photos: [{ url: String, fileName: String }],
    documents: [{ title: String, url: String, fileType: String }],
    accessories: [String],
    notes: String,
    isReturnable: { type: Boolean, default: true },
    depreciationRate: { type: Number, default: 0 },
    salvageValue: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

assetSchema.index({ name: 'text', serialNumber: 'text', model: 'text', brand: 'text' });
assetSchema.index({ category: 1, status: 1 });

module.exports = mongoose.model('Asset', assetSchema);

const assetAssignmentSchema = new mongoose.Schema(
  {
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    assignedAt: { type: Date, default: Date.now },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    expectedReturnDate: Date,
    returnedAt: Date,
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    conditionAtAssignment: { type: String, enum: ['new', 'good', 'fair', 'poor', 'damaged'], default: 'good' },
    conditionAtReturn: { type: String, enum: ['new', 'good', 'fair', 'poor', 'damaged', null], default: null },
    status: { type: String, enum: ['assigned', 'returned', 'transferred', 'lost', 'damaged'], default: 'assigned', index: true },
    acknowledgement: { signed: { type: Boolean, default: false }, signedAt: Date, ip: String },
    returnNotes: String,
    damageReport: { reported: { type: Boolean, default: false }, description: String, cost: { type: Number, default: 0 }, recoveredFromEmployee: { type: Boolean, default: false }, reportedAt: Date, photos: [{ url: String }] },
    transferredTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    transferNote: String,
  },
  { timestamps: true }
);

assetAssignmentSchema.index({ asset: 1, status: 1 });
assetAssignmentSchema.index({ employee: 1, status: 1 });

module.exports.AssetAssignment = mongoose.model('AssetAssignment', assetAssignmentSchema);

const maintenanceRecordSchema = new mongoose.Schema(
  {
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    type: { type: String, enum: ['repair', 'service', 'upgrade', 'inspection', 'replacement'], default: 'service' },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reportedAt: { type: Date, default: Date.now },
    issue: String,
    vendor: String,
    sentDate: Date,
    expectedReturnDate: Date,
    returnedDate: Date,
    cost: { type: Number, default: 0 },
    status: { type: String, enum: ['reported', 'in_progress', 'completed', 'cancelled'], default: 'reported', index: true },
    resolution: String,
    invoiceUrl: String,
  },
  { timestamps: true }
);
module.exports.AssetMaintenance = mongoose.model('AssetMaintenance', maintenanceRecordSchema);
