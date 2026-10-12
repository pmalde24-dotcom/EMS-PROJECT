'use strict';
const http = require('http');
const env = require('./config/env');
const app = require('./app');
const { connectDatabase, disconnectDatabase } = require('./config/db');

let server;

async function start() {
  try {
    const db = await connectDatabase();

    // First-run: make sure the role/permission matrix and company settings exist.
    const { Role, CompanySettings, User } = require('./models');
    await Role.seedDefaults();
    if (!(await CompanySettings.findOne({ singleton: 'company' }))) {
      await CompanySettings.create({ singleton: 'company' });
    }
    const userCount = await User.countDocuments({ deletedAt: null });
    if (userCount === 0) {
      if (env.SEED.demo) {
        // Zero-setup demo: ખાલી DB મળે તો આખી સેમ્પલ કંપની સીડ થાય (demo mode કે Atlas — બંને).
        // SEED_DEMO_DATA=false કરો તો બંધ થાય.
        console.log(`🌱 Empty database detected (${db.mode}) — seeding demo data… (SEED_DEMO_DATA=false થી બંધ કરી શકાય)`);
        const { runSeed } = require('./seed/seed');
        await runSeed({ skipConnect: true });
      } else {
        console.log('ℹ️  No users found and SEED_DEMO_DATA=false — create the first admin with `npm run seed`.');
      }
    }

    server = http.createServer(app);
    server.listen(env.PORT, '0.0.0.0', () => {
      console.log(`\n🚀 EMS API listening on http://0.0.0.0:${env.PORT}`);
      console.log(`   Environment : ${env.NODE_ENV}`);
      console.log(`   Database    : ${db.mode === 'atlas' ? 'MongoDB (MONGODB_URI)' : 'in-memory demo (set MONGODB_URI for persistence)'}`);
      console.log(`   CORS origin : ${env.CLIENT_ORIGIN}`);
      console.log(`   Health      : /api/health\n`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

const shutdown = async (signal) => {
  console.log(`\n${signal} received — shutting down gracefully...`);
  if (server) server.close(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};
['SIGINT', 'SIGTERM'].forEach((s) => process.on(s, () => shutdown(s)));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

start();
