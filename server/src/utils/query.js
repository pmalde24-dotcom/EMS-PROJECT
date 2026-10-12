'use strict';
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Builds a Mongoose query from request query params.
 * Supports: ?q=, ?filter[field]=a,b|  ?sort=-createdAt  ?page=1&limit=20
 * plus arbitrary top-level filters defined by the caller.
 */
function buildQuery(query = {}, { searchFields = [], filterFields = [], baseFilter = {}, defaultSort = '-createdAt' } = {}) {
  const filter = { ...baseFilter };
  const and = [];

  const { q, search, sort, page = 1, limit = 20, from, to, dateField, select, includeDeleted } = query;
  const term = q || search; // ?search= is accepted as an alias of ?q=

  if (term && searchFields.length) {
    const rx = new RegExp(escapeRegex(String(term).trim()), 'i');
    and.push({ $or: searchFields.map((f) => ({ [f]: rx })) });
  }

  const source = { ...(query.filter || {}), ...pickFilters(query, filterFields) };
  Object.entries(source).forEach(([key, raw]) => {
    if (raw === '' || raw === undefined || raw === null) return;
    const values = Array.isArray(raw) ? raw : String(raw).split(',').filter(Boolean);
    if (!values.length) return;
    if (values.length === 1) filter[key] = coerce(values[0]);
    else filter[key] = { $in: values.map(coerce) };
  });

  if (from || to) {
    const field = dateField || 'createdAt';
    const range = {};
    if (from) range.$gte = new Date(from);
    if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); range.$lte = d; }
    and.push({ [field]: range });
  }

  if (and.length) filter.$and = and;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));

  return {
    filter,
    page: pageNum,
    limit: limitNum,
    skip: (pageNum - 1) * limitNum,
    sort: parseSort(sort, defaultSort),
    select: select || undefined,
    includeDeleted: includeDeleted === 'true' || includeDeleted === true,
  };
}

function pickFilters(query, filterFields) {
  const out = {};
  filterFields.forEach((f) => { if (query[f] !== undefined) out[f] = query[f]; });
  return out;
}
const coerce = (v) => {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  return v;
};
function parseSort(sort, fallback) {
  const raw = sort || fallback;
  if (!raw) return { createdAt: -1 };
  return String(raw).split(',').reduce((acc, part) => {
    const key = part.trim();
    if (!key) return acc;
    acc[key.startsWith('-') ? key.slice(1) : key] = key.startsWith('-') ? -1 : 1;
    return acc;
  }, {});
}

async function paginate(model, opts, { populate, select, lean = true } = {}) {
  const { filter, page, limit, skip, sort } = opts;
  let q = model.find(filter).sort(sort).skip(skip).limit(limit);
  if (select) q = q.select(select);
  if (populate) q = q.populate(populate);
  const [items, total] = await Promise.all([q.lean(lean).exec(), model.countDocuments(filter)]);
  return {
    items,
    meta: { page, limit, total, pages: Math.ceil(total / limit) || 1, hasNext: page * limit < total, hasPrev: page > 1 },
  };
}
module.exports = { buildQuery, paginate, parseSort, escapeRegex, coerce };
