'use strict';
const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema(
  { _id: String, seq: { type: Number, default: 0 } },
  { versionKey: false }
);
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

/** Atomically increments and returns the next sequence number for a key. */
async function nextSequence(key, startAt = 1) {
  // Bootstrap the counter if missing. NOTE: MongoDB rejects $inc + $setOnInsert on the
  // same path ("Updating the path 'seq' would create a conflict at 'seq'"), so the first
  // value is written with a plain insert instead. A concurrent insert (E11000) is safe:
  // the sibling process created the same counter and $inc below takes over from it.
  const exists = await Counter.exists({ _id: key });
  if (!exists) {
    try {
      await Counter.create({ _id: key, seq: startAt - 1 });
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  const doc = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { new: true });
  return doc.seq;
}

/**
 * Generates the next code from a company-configured pattern.
 * Pattern tokens: {PREFIX} {YYYY} {YY} {MM} {SEQ:n}
 */
async function nextCode(pattern, { prefix = 'EMP', seqKey }) {
  const now = new Date();
  const seqMatch = /\{SEQ:(\d+)\}/.exec(pattern || '');
  const padding = seqMatch ? parseInt(seqMatch[1], 10) : 4;
  const key = seqKey || pattern.replace(/\{SEQ:\d+\}/, 'SEQ').replace(/\{(PREFIX|YYYY|YY|MM)\}/g, '');
  const seq = await nextSequence(`${key}:${now.getFullYear()}`, 1);
  return (pattern || '{PREFIX}{SEQ:4}')
    .replace('{PREFIX}', prefix)
    .replace('{YYYY}', String(now.getFullYear()))
    .replace('{YY}', String(now.getFullYear()).slice(-2))
    .replace('{MM}', String(now.getMonth() + 1).padStart(2, '0'))
    .replace(/\{SEQ:\d+\}/, String(seq).padStart(padding, '0'));
}
module.exports = { nextSequence, nextCode, Counter };
