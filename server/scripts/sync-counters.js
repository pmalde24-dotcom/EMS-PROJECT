'use strict';
/**
 * Counter sync — makes the shared `counters` collection agree with the data that
 * already exists in the database.
 *
 * Why: id generators (utils/sequence.js) allocate numbers from counters, while data
 * imported/seeded outside that path (e.g. `ACM20260041`) does not bump them. Without a
 * sync the next generated id collides with an existing record.
 *
 * Safe to run any time — it only ever moves counters forward.
 *
 *   npm run db:sync-counters
 */
require('../src/config/env');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const M = require('../src/models');
const { Counter } = require('../src/utils/sequence');

const upsertAtLeast = async (key, value, label) => {
  if (!value) { console.log(`   – ${label}: ડેટા નથી, છોડ્યું`); return; }
  const existing = await Counter.findById(key).lean();
  if (existing && existing.seq >= value) { console.log(`   = ${label}: counter ${key} પહેલેથી ${existing.seq} (બદલવાની જરૂર નથી)`); return; }
  await Counter.findOneAndUpdate({ _id: key }, { $set: { seq: value } }, { upsert: true });
  console.log(`   ↑ ${label}: counter ${key} → ${value}`);
};

(async () => {
  console.log('🔢 કાઉન્ટર સિંક — counters ↔ existing data\n');
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });

  /* Employee IDs: pattern {PREFIX}{YYYY}{SEQ:n} → counter key `${PREFIX}SEQ:${year}` */
  const settings = await M.CompanySettings.findOne({ singleton: 'company' }).lean();
  const pattern = settings?.employeeIdPattern || 'ACM{YYYY}{SEQ:4}';
  const parsed = /^(.*)\{YYYY\}\{SEQ:(\d+)\}$/.exec(pattern);
  if (parsed) {
    const [, prefix, padStr] = parsed;
    const pad = Number(padStr);
    const rows = await M.Employee.find({ employeeId: new RegExp(`^${prefix}\\d{${pad + 4}}$`) }).select('employeeId').lean();
    const byYear = new Map();
    rows.forEach((r) => {
      const m = new RegExp(`^${prefix}(\\d{4})(\\d{${pad}})$`).exec(r.employeeId);
      if (!m) return;
      const [, year, seq] = m;
      byYear.set(year, Math.max(byYear.get(year) || 0, parseInt(seq, 10)));
    });
    if (!byYear.size) console.log(`   – કર્મચારી ID (${pattern}): કોઈ હાલનું રેકોર્ડ નથી`);
    for (const [year, maxSeq] of byYear) await upsertAtLeast(`${prefix}SEQ:${year}`, maxSeq, `કર્મચારી ID ${prefix}${year}#### (${rows.length} રેકોર્ડમાંથી max)`);
  } else {
    console.log(`   ⚠️ employeeIdPattern "${pattern}" સમજી શકાયો નહીં — છોડ્યું`);
  }

  /* Asset IDs: route uses nextCode('AST{YYYY}{SEQ:4}', { seqKey: 'asset' }) → counter key asset:<year> */
  const assetRows = await M.Asset.find({ assetId: /^AST\d{8}$/ }).select('assetId').lean();
  const assetByYear = new Map();
  assetRows.forEach((r) => {
    const m = /^AST(\d{4})(\d{4})$/.exec(r.assetId);
    if (m) assetByYear.set(m[1], Math.max(assetByYear.get(m[1]) || 0, parseInt(m[2], 10)));
  });
  if (!assetByYear.size) console.log('   – સંપત્તિ ID (AST{YYYY}{SEQ:4}): કોઈ હાલનું રેકોર્ડ નથી');
  for (const [year, maxSeq] of assetByYear) await upsertAtLeast(`asset:${year}`, maxSeq, `સંપત્તિ ID AST${year}#### (${assetRows.length} રેકોર્ડમાંથી max)`);

  /* Training programme codes: TRN#### via nextSequence('training', 1000) */
  const trainings = await M.TrainingProgram.find({ code: /^TRN\d+$/ }).select('code').lean();
  const maxTrn = trainings.reduce((m, t) => Math.max(m, parseInt(t.code.replace('TRN', ''), 10) || 0), 0);
  if (maxTrn) await upsertAtLeast('training', maxTrn, `તાલીમ કોડ TRN#### (max TRN${maxTrn})`);
  else console.log('   – તાલીમ કોડ: TRN કોડવાળા પ્રોગ્રામ નથી');

  console.log('\n✅ સિંક પૂરું — હવે નવી ID બનાવવાથી ટકરાવ નહીં થાય.');
  await mongoose.disconnect();
})().catch((e) => { console.error('❌ સિંક નિષ્ફળ:', e.message); process.exit(1); });
