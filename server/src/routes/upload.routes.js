'use strict';
const express = require('express');
const { fileUploader, persistFile, ALLOWED } = require('../utils/upload');
const asyncHandler = require('../utils/asyncHandler');
const respond = require('../utils/respond');
const { authenticate } = require('../middleware/auth');
const ApiError = require('../utils/ApiError');
const { recordAudit } = require('../utils/audit');

const router = express.Router();

/**
 * Generic authenticated upload endpoint.
 * POST /api/uploads/:folder  (folder: photos | documents | resumes | receipts)
 * Form-data: file=<binary>  → returns { url, fileName, fileType, size }
 */
router.post('/:folder', authenticate, (req, res, next) => {
  const folder = req.params.folder;
  const types = folder === 'photos' ? ALLOWED.image : folder === 'resumes' ? [...ALLOWED.doc, ...ALLOWED.image] : ALLOWED.doc.concat(ALLOWED.image);
  const maxSizeMB = folder === 'photos' ? 3 : 10;
  return fileUploader({ types, maxSizeMB })(req, res, (err) => {
    if (err) return next(err instanceof Error ? ApiError.badRequest(err.message) : err);
    next();
  });
}, asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No file received. Use form-data field "file".');
  const meta = await persistFile(req.file);
  await recordAudit(req, { action: 'file.upload', module: 'documents', description: `Uploaded ${meta.fileName} (${Math.round((meta.size || 0) / 1024)} KB) to ${req.params.folder}` });
  return respond.created(res, meta, 'File uploaded successfully');
}));

module.exports = router;
