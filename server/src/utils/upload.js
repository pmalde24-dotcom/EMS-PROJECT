'use strict';
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const env = require('../config/env');
const ApiError = require('./ApiError');

const ROOT = path.join(__dirname, '..', '..', 'uploads');
const FOLDERS = ['photos', 'documents', 'resumes', 'receipts'];
FOLDERS.forEach((f) => fs.mkdirSync(path.join(ROOT, f), { recursive: true }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sub = FOLDERS.includes(req.params.folder) ? req.params.folder : 'documents';
    cb(null, path.join(ROOT, sub));
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safe}`);
  },
});

const ALLOWED = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  doc: [
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv', 'text/plain',
  ],
};
const ALLOWED_ALL = [...ALLOWED.image, ...ALLOWED.doc];

/** Validates MIME type + size, then stores. Files stay local unless Cloudinary is configured. */
function fileUploader({ types = ALLOWED_ALL, maxSizeMB = 5, field = 'file' } = {}) {
  const upload = multer({
    storage,
    limits: { fileSize: maxSizeMB * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!types.includes(file.mimetype)) {
        return cb(ApiError.badRequest(`File type not allowed: ${file.mimetype}. Allowed: ${types.join(', ')}`));
      }
      cb(null, true);
    },
  });
  return upload.single(field);
}

const publicUrl = (file) => (file ? `/uploads/${file.destination.split(/[\\/]/).pop()}/${file.filename}` : null);

/** Uploads a local file to Cloudinary when configured; otherwise keeps the local path. */
async function persistFile(file) {
  if (!file) return null;
  const meta = {
    fileName: file.originalname,
    fileType: file.mimetype,
    size: file.size,
    path: file.path,
    url: publicUrl(file),
    storage: 'local',
  };
  if (!env.cloudinaryEnabled) return meta;
  try {
    const cloudinary = require('cloudinary').v2;
    cloudinary.config(env.CLOUDINARY);
    const res = await cloudinary.uploader.upload(file.path, {
      folder: 'ems',
      resource_type: 'auto',
      use_filename: true,
      unique_filename: true,
    });
    fs.unlink(file.path, () => {});
    return { ...meta, url: res.secure_url, publicId: res.public_id, storage: 'cloudinary' };
  } catch (e) {
    console.warn('cloudinary upload failed, keeping local copy:', e.message);
    return meta;
  }
}
module.exports = { fileUploader, persistFile, ALLOWED, ROOT };
