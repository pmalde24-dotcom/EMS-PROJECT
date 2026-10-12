'use strict';
const express = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const { Asset, AssetAssignment, AssetMaintenance, Employee } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const validate = require('../middleware/validate');
const { requirePermission } = require('../middleware/auth');
const { buildQuery, paginate } = require('../utils/query');
const { recordAudit } = require('../utils/audit');
const { sendCSV } = require('../utils/csv');
const { notify } = require('../utils/notify');
const { nextCode } = require('../utils/sequence');

const router = express.Router();

const assetSchema = z.object({
  name: z.string().min(2), category: z.enum(['laptop', 'desktop', 'monitor', 'mobile', 'tablet', 'keyboard', 'mouse', 'headset', 'printer', 'access_card', 'sim_card', 'furniture', 'vehicle', 'network_device', 'software_license', 'other']),
  assetId: z.string().optional(), brand: z.string().optional(), model: z.string().optional(),
  serialNumber: z.string().optional(), imei: z.string().optional(), specifications: z.string().optional(),
  purchaseDate: z.coerce.date().optional(), purchasePrice: z.coerce.number().optional(), vendor: z.string().optional(),
  invoiceNumber: z.string().optional(), warrantyExpiry: z.coerce.date().optional(), amcExpiry: z.coerce.date().optional(),
  condition: z.enum(['new', 'good', 'fair', 'poor', 'damaged']).optional(),
  status: z.enum(['available', 'assigned', 'maintenance', 'retired', 'lost', 'damaged']).optional(),
  location: z.string().optional(), department: z.string().optional().nullable(),
  accessories: z.array(z.string()).optional(), notes: z.string().optional(), isReturnable: z.boolean().optional(),
  depreciationRate: z.coerce.number().optional(), salvageValue: z.coerce.number().optional(),
}).passthrough();

/* ── ASSETS CRUD ──────────────────────────────────────────────────── */
router.get('/', requirePermission('assets:view'), asyncHandler(async (req, res) => {
  const opts = buildQuery(req.query, { searchFields: ['name', 'assetId', 'serialNumber', 'brand', 'model', 'specifications'], filterFields: ['category', 'status', 'condition', 'department', 'currentHolder'], defaultSort: '-createdAt' });
  opts.filter.deletedAt = null;
  const { items, meta } = await paginate(Asset, opts, { populate: [{ path: 'currentHolder', select: 'firstName lastName employeeId' }, { path: 'department', select: 'name' }] });
  if (req.query.export === 'csv') {
    return sendCSV(res, `assets-${Date.now()}.csv`, items, [
      { key: 'assetId', label: 'Asset ID' }, { key: 'name', label: 'Name' }, { key: 'category', label: 'Category' },
      { key: 'brand', label: 'Brand' }, { key: 'model', label: 'Model' }, { key: 'serialNumber', label: 'Serial No' },
      { key: 'status', label: 'Status' }, { key: 'condition', label: 'Condition' },
      { key: 'currentHolder', label: 'Assigned To', value: (r) => (r.currentHolder ? `${r.currentHolder.firstName} ${r.currentHolder.lastName}` : '') },
      { key: 'purchaseDate', label: 'Purchase Date', value: (r) => (r.purchaseDate ? new Date(r.purchaseDate).toISOString().slice(0, 10) : '') },
      { key: 'warrantyExpiry', label: 'Warranty', value: (r) => (r.warrantyExpiry ? new Date(r.warrantyExpiry).toISOString().slice(0, 10) : '') },
    ]);
  }
  return respond.list(res, items, meta);
}));

router.get('/my-assets', requirePermission('assets:view'), asyncHandler(async (req, res) => {
  const assignments = await AssetAssignment.find({ employee: req.scope.selfEmployeeId, status: 'assigned' })
    .populate('asset', 'assetId name category brand model serialNumber condition status warrantyExpiry').sort('-assignedAt').lean();
  return respond.list(res, assignments, { total: assignments.length });
}));

router.get('/stats/summary', requirePermission('assets:view', 'reports:view'), asyncHandler(async (req, res) => {
  const base = { deletedAt: null };
  const [byStatus, byCategory, totalValue, expiringWarranty, maintenance] = await Promise.all([
    Asset.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Asset.aggregate([{ $match: base }, { $group: { _id: '$category', count: { $sum: 1 }, value: { $sum: '$purchasePrice' } } }, { $sort: { count: -1 } }]),
    Asset.aggregate([{ $match: base }, { $group: { _id: null, value: { $sum: '$purchasePrice' }, count: { $sum: 1 } } }]),
    Asset.countDocuments({ ...base, warrantyExpiry: { $gte: new Date(), $lte: new Date(Date.now() + 90 * 86400000) } }),
    AssetMaintenance.countDocuments({ status: { $in: ['reported', 'in_progress'] } }),
  ]);
  return respond.ok(res, { byStatus, byCategory, totalValue: totalValue[0]?.value || 0, totalAssets: totalValue[0]?.count || 0, expiringWarranty, inMaintenance: maintenance });
}));

router.get('/:id', requirePermission('assets:view'), asyncHandler(async (req, res) => {
  const asset = await Asset.findOne({ _id: req.params.id, deletedAt: null }).populate('currentHolder department', 'firstName lastName employeeId name').lean();
  if (!asset) throw ApiError.notFound('Asset not found');
  const [history, maintenance] = await Promise.all([
    AssetAssignment.find({ asset: asset._id }).populate('employee assignedBy receivedBy', 'firstName lastName employeeId name').sort('-assignedAt').lean(),
    AssetMaintenance.find({ asset: asset._id }).sort('-reportedAt').lean(),
  ]);
  return respond.ok(res, { asset, history, maintenance });
}));

router.post('/', requirePermission('assets:create'), validate({ body: assetSchema }), asyncHandler(async (req, res) => {
  const assetId = req.body.assetId || await nextCode('AST{YYYY}{SEQ:4}', { prefix: 'AST', seqKey: 'asset' });
  if (req.body.serialNumber) {
    const dup = await Asset.findOne({ serialNumber: req.body.serialNumber, deletedAt: null });
    if (dup) throw ApiError.conflict(`An asset with serial number ${req.body.serialNumber} already exists (${dup.assetId})`);
  }
  const asset = await Asset.create({ ...req.body, assetId, createdBy: req.user._id, department: req.body.department || undefined });
  await recordAudit(req, { action: 'asset.create', module: 'assets', targetModel: 'Asset', targetId: asset._id, description: `Registered asset ${asset.assetId} — ${asset.name}` });
  return respond.created(res, asset, 'Asset registered');
}));

router.patch('/:id', requirePermission('assets:update'), asyncHandler(async (req, res) => {
  const asset = await Asset.findById(req.params.id);
  if (!asset) throw ApiError.notFound('Asset not found');
  if (req.body.status === 'assigned' && !asset.currentHolder) throw ApiError.badRequest('Use the assign endpoint to assign an asset to an employee');
  Object.assign(asset, req.body);
  await asset.save();
  await recordAudit(req, { action: 'asset.update', module: 'assets', targetId: asset._id, description: `Updated asset ${asset.assetId}` });
  return respond.ok(res, asset, 'Asset updated');
}));

router.delete('/:id', requirePermission('assets:delete'), asyncHandler(async (req, res) => {
  const asset = await Asset.findById(req.params.id);
  if (!asset) throw ApiError.notFound('Asset not found');
  if (asset.status === 'assigned') throw ApiError.conflict('This asset is currently assigned. Collect it back before deleting.');
  asset.deletedAt = new Date(); asset.status = 'retired';
  await asset.save();
  await recordAudit(req, { action: 'asset.delete', module: 'assets', targetId: asset._id, description: `Retired asset ${asset.assetId}`, severity: 'warning' });
  return respond.ok(res, { _id: asset._id }, 'Asset retired');
}));

/* ── ASSIGN / RETURN / TRANSFER ───────────────────────────────────── */
router.post('/:id/assign', requirePermission('assets:update'), validate({ body: z.object({
  employeeId: z.string(), expectedReturnDate: z.coerce.date().optional(), conditionAtAssignment: z.enum(['new', 'good', 'fair', 'poor', 'damaged']).optional(), note: z.string().optional(),
}) }), asyncHandler(async (req, res) => {
  const asset = await Asset.findById(req.params.id);
  if (!asset) throw ApiError.notFound('Asset not found');
  if (asset.status === 'assigned') throw ApiError.conflict(`This asset is already assigned to ${asset.currentHolder} (assigned ${asset.assignedAt ? new Date(asset.assignedAt).toDateString() : ''}). An asset cannot be assigned to two employees at once — return or transfer it first.`);
  if (['retired', 'lost'].includes(asset.status)) throw ApiError.badRequest(`Cannot assign an asset in "${asset.status}" state`);
  const employee = await Employee.findById(req.body.employeeId);
  if (!employee) throw ApiError.notFound('Employee not found');
  asset.status = 'assigned'; asset.currentHolder = employee._id; asset.assignedAt = new Date();
  asset.condition = req.body.conditionAtAssignment || asset.condition;
  await asset.save();
  const assignment = await AssetAssignment.create({ asset: asset._id, employee: employee._id, assignedBy: req.user._id, expectedReturnDate: req.body.expectedReturnDate, conditionAtAssignment: asset.condition, status: 'assigned', returnNotes: req.body.note });
  await notify({ userId: employee.user, title: 'Asset assigned to you', body: `${asset.name} (${asset.assetId}) has been assigned to you. Please acknowledge receipt.`, type: 'asset', link: '/assets/my-assets', sendEmail: true });
  await recordAudit(req, { action: 'asset.assign', module: 'assets', targetId: asset._id, description: `Assigned ${asset.assetId} to ${employee.fullName}`, severity: 'warning' });
  return respond.created(res, assignment, 'Asset assigned');
}));

router.post('/assignments/:assignmentId/acknowledge', requirePermission('assets:view'), asyncHandler(async (req, res) => {
  const assignment = await AssetAssignment.findById(req.params.assignmentId);
  if (!assignment) throw ApiError.notFound('Assignment not found');
  if (String(assignment.employee) !== String(req.scope.selfEmployeeId)) throw ApiError.forbidden('You can only acknowledge your own assets');
  assignment.acknowledgement = { signed: true, signedAt: new Date(), ip: req.ip };
  await assignment.save();
  return respond.ok(res, assignment.acknowledgement, 'Receipt acknowledged');
}));

router.post('/assignments/:assignmentId/return', requirePermission('assets:update'), validate({ body: z.object({
  conditionAtReturn: z.enum(['new', 'good', 'fair', 'poor', 'damaged']), returnNotes: z.string().optional(),
  damage: z.object({ description: z.string(), cost: z.coerce.number().optional(), recoveredFromEmployee: z.boolean().optional() }).optional(),
}) }), asyncHandler(async (req, res) => {
  const assignment = await AssetAssignment.findById(req.params.assignmentId);
  if (!assignment) throw ApiError.notFound('Assignment not found');
  if (assignment.status === 'returned') throw ApiError.badRequest('Asset already returned');
  assignment.status = 'returned'; assignment.returnedAt = new Date(); assignment.receivedBy = req.user._id;
  assignment.conditionAtReturn = req.body.conditionAtReturn; assignment.returnNotes = req.body.returnNotes;
  if (req.body.damage) assignment.damageReport = { reported: true, ...req.body.damage, reportedAt: new Date() };
  await assignment.save();
  const asset = await Asset.findById(assignment.asset);
  asset.status = req.body.damage ? 'maintenance' : 'available';
  asset.currentHolder = null; asset.assignedAt = null; asset.condition = req.body.conditionAtReturn;
  await asset.save();
  await recordAudit(req, { action: 'asset.return', module: 'assets', targetId: asset._id, description: `Asset ${asset.assetId} returned (condition: ${req.body.conditionAtReturn})`, severity: 'warning' });
  return respond.ok(res, { assignment, asset }, 'Asset returned');
}));

router.post('/assignments/:assignmentId/transfer', requirePermission('assets:update'), validate({ body: z.object({ toEmployeeId: z.string(), note: z.string().optional() }) }), asyncHandler(async (req, res) => {
  const assignment = await AssetAssignment.findById(req.params.assignmentId);
  if (!assignment) throw ApiError.notFound('Assignment not found');
  if (assignment.status !== 'assigned') throw ApiError.badRequest('Only an active assignment can be transferred');
  const to = await Employee.findById(req.body.toEmployeeId);
  if (!to) throw ApiError.notFound('Target employee not found');
  assignment.status = 'transferred'; assignment.returnedAt = new Date(); assignment.transferredTo = to._id; assignment.transferNote = req.body.note;
  await assignment.save();
  const newAssignment = await AssetAssignment.create({ asset: assignment.asset, employee: to._id, assignedBy: req.user._id, conditionAtAssignment: req.body.condition || 'good', status: 'assigned', transferNote: req.body.note });
  await Asset.findByIdAndUpdate(assignment.asset, { currentHolder: to._id, assignedAt: new Date(), status: 'assigned' });
  await notify({ userId: to.user, title: 'Asset transferred to you', body: 'A company asset has been transferred to your custody.', type: 'asset', link: '/assets/my-assets' });
  await recordAudit(req, { action: 'asset.transfer', module: 'assets', targetId: assignment.asset, description: `Asset transferred to ${to.fullName}`, severity: 'warning' });
  return respond.ok(res, newAssignment, 'Asset transferred');
}));

/* ── MAINTENANCE ──────────────────────────────────────────────────── */
router.post('/:id/maintenance', requirePermission('assets:update'), validate({ body: z.object({
  type: z.enum(['repair', 'service', 'upgrade', 'inspection', 'replacement']).optional(),
  issue: z.string().min(3), vendor: z.string().optional(), sentDate: z.coerce.date().optional(), expectedReturnDate: z.coerce.date().optional(), cost: z.coerce.number().optional(),
}) }), asyncHandler(async (req, res) => {
  const asset = await Asset.findById(req.params.id);
  if (!asset) throw ApiError.notFound('Asset not found');
  if (asset.status === 'assigned') throw ApiError.badRequest('Collect the asset from the employee before sending it for maintenance');
  const record = await AssetMaintenance.create({ ...req.body, asset: asset._id, reportedBy: req.user._id, status: 'in_progress' });
  asset.status = 'maintenance';
  await asset.save();
  await recordAudit(req, { action: 'asset.maintenance', module: 'assets', targetId: asset._id, description: `Asset ${asset.assetId} sent for ${req.body.type || 'service'}: ${req.body.issue}`, severity: 'warning' });
  return respond.created(res, record, 'Maintenance record created');
}));

router.patch('/maintenance/:id', requirePermission('assets:update'), asyncHandler(async (req, res) => {
  const record = await AssetMaintenance.findById(req.params.id);
  if (!record) throw ApiError.notFound('Maintenance record not found');
  Object.assign(record, req.body);
  if (req.body.status === 'completed') {
    record.returnedDate = req.body.returnedDate || new Date();
    const asset = await Asset.findById(record.asset);
    if (asset) { asset.status = 'available'; asset.condition = req.body.condition || 'good'; await asset.save(); }
  }
  await record.save();
  return respond.ok(res, record, 'Maintenance updated');
}));

/* ── REPORTS ──────────────────────────────────────────────────────── */
router.get('/reports/allocation', requirePermission('assets:view', 'reports:view'), asyncHandler(async (req, res) => {
  const [byDepartment, byEmployee, unassigned] = await Promise.all([
    Asset.aggregate([
      { $match: { deletedAt: null, status: 'assigned' } },
      { $lookup: { from: 'employees', localField: 'currentHolder', foreignField: '_id', as: 'e' } }, { $unwind: '$e' },
      { $group: { _id: '$e.department', count: { $sum: 1 }, value: { $sum: '$purchasePrice' } } },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } }, { $unwind: { path: '$d', preserveNullAndEmptyArrays: true } },
      { $project: { department: { $ifNull: ['$d.name', 'Unassigned'] }, count: 1, value: 1, _id: 0 } },
    ]),
    Asset.aggregate([
      { $match: { deletedAt: null, status: 'assigned' } },
      { $group: { _id: '$currentHolder', count: { $sum: 1 }, value: { $sum: '$purchasePrice' } } },
      { $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'e' } }, { $unwind: '$e' },
      { $project: { name: { $concat: ['$e.firstName', ' ', '$e.lastName'] }, employeeId: '$e.employeeId', count: 1, value: 1, _id: 0 } },
      { $sort: { count: -1 } }, { $limit: 50 },
    ]),
    Asset.find({ deletedAt: null, status: 'available' }).select('assetId name category purchasePrice').lean(),
  ]);
  return respond.ok(res, { byDepartment, byEmployee, available: unassigned, availableCount: unassigned.length });
}));

module.exports = router;
