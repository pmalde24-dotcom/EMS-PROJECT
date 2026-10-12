'use strict';

/** RFC-4180 CSV with Excel-friendly UTF-8 BOM. */
function toCSV(rows, columns) {
  const cols = columns || Object.keys(rows[0] || {}).map((k) => ({ key: k, label: k }));
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    let s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    if (typeof v === 'object') s = JSON.stringify(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => cols.map((c) => esc(typeof c.value === 'function' ? c.value(r) : get(r, c.key))).join(',')).join('\n');
  return `\uFEFF${header}\n${body}`;
}

function get(obj, path) {
  return String(path).split('.').reduce((acc, k) => (acc === null || acc === undefined ? acc : acc[k]), obj);
}

function sendCSV(res, filename, rows, columns) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCSV(rows, columns));
}
module.exports = { toCSV, sendCSV, parseCSV };

/** Minimal RFC-4180 CSV parser (handles quotes, embedded commas/newlines). */
function parseCSV(text) {
  const clean = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = []; let row = []; let field = ''; let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') { if (clean[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = (rows.shift() || []).map((h) => h.trim());
  return rows.filter((r) => r.some((v) => String(v).trim() !== '')).map((r) => {
    const obj = {}; header.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); }); return obj;
  });
}
module.exports.parseCSV = parseCSV;
