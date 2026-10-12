'use strict';
const AuditLog = require('../models/AuditLog');

/**
 * Writes an immutable audit entry. Never store passwords, tokens or
 * document contents — only identifiers and small diffs.
 */
async function recordAudit(req, { action, module, targetModel, targetId, description, metadata, severity = 'info' }) {
  try {
    await AuditLog.create({
      actor: req.user?._id || null,
      actorRole: req.user?.role || 'system',
      actorName: req.user?.name || 'System',
      action,
      module,
      targetModel,
      targetId: targetId ? String(targetId) : undefined,
      description,
      metadata: sanitize(metadata),
      ip: req.ip || req.headers?.['x-forwarded-for'] || '',
      userAgent: (req.headers?.['user-agent'] || '').slice(0, 250),
      severity,
      at: new Date(),
    });
  } catch (e) {
    console.warn('audit log failed:', e.message);
  }
}

const SENSITIVE = /password|token|secret|accountNumber|ifsc|resume|apiKey/i;
function sanitize(obj, depth = 0) {
  if (!obj || depth > 3) return undefined;
  if (Array.isArray(obj)) return obj.slice(0, 20).map((v) => sanitize(v, depth + 1));
  if (typeof obj !== 'object') return obj;
  const out = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (SENSITIVE.test(k)) { out[k] = '[REDACTED]'; return; }
    if (v instanceof Date) { out[k] = v; return; }
    if (v && typeof v === 'object') { const s = sanitize(v, depth + 1); if (s !== undefined) out[k] = s; return; }
    out[k] = v;
  });
  return out;
}
module.exports = { recordAudit };
