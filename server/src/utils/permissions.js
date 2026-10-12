'use strict';
const Role = require('../models/Role');
const { ROLE_PERMISSIONS } = require('../config/constants');

const TTL_MS = 60 * 1000;
const cache = new Map(); // roleKey -> { permissions, at }

/**
 * Effective permissions for a role. Reads the editable `roles` collection
 * (Super Admin can change role permissions in Settings) with a 60s cache and
 * falls back to the built-in defaults.
 */
async function getRolePermissions(roleKey) {
  const hit = cache.get(roleKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.permissions;
  let permissions = ROLE_PERMISSIONS[roleKey] || [];
  try {
    const doc = await Role.findOne({ key: roleKey, isActive: true }).lean();
    if (doc && Array.isArray(doc.permissions) && doc.permissions.length) permissions = doc.permissions;
  } catch { /* DB not ready — use defaults */ }
  cache.set(roleKey, { permissions, at: Date.now() });
  return permissions;
}

function invalidateRoleCache(roleKey) {
  if (roleKey) cache.delete(roleKey);
  else cache.clear();
}

/** role defaults + per-user grants − revoked overrides. */
async function resolvePermissions(user) {
  const rolePerms = await getRolePermissions(user.role);
  if (rolePerms.includes('*')) return ['*'];
  const set = new Set([...rolePerms, ...(user.extraPermissions || [])]);
  (user.revokedPermissions || []).forEach((p) => set.delete(p));
  return Array.from(set);
}

const can = (perms, permission) => perms.includes('*') || perms.includes(permission);

module.exports = { getRolePermissions, resolvePermissions, invalidateRoleCache, can };
