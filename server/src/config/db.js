'use strict';
const mongoose = require('mongoose');
const env = require('./env');

let memoryServer = null;

async function connectDatabase() {
  mongoose.set('strictQuery', true);
  const opts = { serverSelectionTimeoutMS: 12000, autoIndex: true, maxPoolSize: 20 };

  if (env.MONGODB_URI) {
    await mongoose.connect(env.MONGODB_URI, opts);
    console.log(`✅ MongoDB Atlas connected → ${mongoose.connection.host}/${mongoose.connection.name}`);
    return { mode: 'atlas', uri: env.MONGODB_URI };
  }

  if (env.isProd && !env.ALLOW_DEMO_MODE) {
    throw new Error('MONGODB_URI is required in production. (અથવા ટેસ્ટ-ડિપ્લોય માટે ALLOW_DEMO_MODE=true સેટ કરો.)');
  }
  if (env.isProd) {
    console.warn('⚠️  ALLOW_DEMO_MODE=true → in-memory demo DB વપરાય છે. ડેટા રીસ્ટાર્ટ પર જતો રહે. કાયમી ડેટા માટે MONGODB_URI સેટ કરો.');
  }

  // Dev/demo fallback: in-memory MongoDB so the app runs with zero setup.
  // Data is NOT persisted between restarts unless MONGODB_URI is provided.
  const { MongoMemoryServer } = require('mongodb-memory-server');
  console.log('ℹ️  MONGODB_URI not set → starting in-memory MongoDB (demo mode)...');
  memoryServer = await MongoMemoryServer.create({ instance: { dbName: 'ems' } });
  const uri = memoryServer.getUri('ems');
  await mongoose.connect(uri, opts);
  console.log('✅ In-memory MongoDB ready. Set MONGODB_URI in .env for persistent Atlas data.');
  return { mode: 'memory', uri };
}

async function disconnectDatabase() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}

module.exports = { connectDatabase, disconnectDatabase, isMemory: () => !!memoryServer };
