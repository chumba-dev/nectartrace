const mongoose = require('mongoose');
const env = require('./env');

const CONNECTION_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

async function connectMongo() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!env.mongodb.uri) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(env.mongodb.uri);
  return mongoose.connection;
}

async function disconnectMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

function getMongoConnectionStatus() {
  return CONNECTION_STATES[mongoose.connection.readyState] || 'unknown';
}

module.exports = {
  connectMongo,
  disconnectMongo,
  getMongoConnectionStatus,
};
