'use strict';
/**
 * Database connectivity check.
 * Usage: npm run db:check
 * Reads MONGODB_URI from .env, connects, prints details and row counts, exits.
 */
require('../src/config/env');
const mongoose = require('mongoose');
const env = require('../src/config/env');

(async () => {
  if (!env.MONGODB_URI) {
    console.log('❌ MONGODB_URI is empty in server/.env — the app is running on the in-memory demo database.');
    console.log('   Paste your MongoDB Atlas connection string into server/.env and run this again.');
    process.exit(1);
  }
  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
    const db = mongoose.connection;
    const names = await db.db.listCollections().toArray();
    console.log('✅ Connected to MongoDB');
    console.log(`   host      : ${db.host}`);
    console.log(`   database  : ${db.name}`);
    console.log(`   collections: ${names.length}`);
    const models = ['users', 'employees', 'departments', 'attendances', 'leaverequests', 'payslips', 'projects', 'tasks', 'assets'];
    for (const m of models) {
      const count = await db.db.collection(m).countDocuments().catch(() => 0);
      console.log(`   - ${m.padEnd(16)} ${count}`);
    }
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    if (/authentication failed/i.test(err.message)) console.error('   → Password or user name is wrong (check for special characters that must be URL-encoded).');
    if (/IP|whitelist|not allowed/i.test(err.message)) console.error('   → Add this machine\'s IP (or 0.0.0.0/0) in Atlas → Network Access.');
    if (/ENOTFOUND|querySrv/i.test(err.message)) console.error('   → Cluster host name is wrong or DNS/network is blocked.');
    process.exit(2);
  }
})();
