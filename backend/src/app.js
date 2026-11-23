const express = require('express');
const cors = require('cors');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const prisma = require('./config/db');
const { getMongoConnectionStatus } = require('./config/mongo');
const ussdRoutes = require('./routes/ussd');
const adminRoutes = require('./routes/admin');

// Route imports — declared ONCE
const authRoutes = require('./routes/auth');
const batchRoutes = require('./routes/batches');
const cooperativeRoutes = require('./routes/cooperatives');
const listingRoutes = require('./routes/listings');
const orderRoutes = require('./routes/orders');
const priceRoutes = require('./routes/prices');
const harvestOfferRoutes = require('./routes/harvestOffers');
const paymentRoutes = require('./routes/payments');

const app = express();

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger (dev only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
  });
}

// ============================================
// HEALTH CHECK
// ============================================

app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    service: 'NectarTrace API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    checks: {
      database: 'unknown',
      mongodb: getMongoConnectionStatus(),
      blockchain: 'unknown',
    },
  };

  // Check database
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = 'ok';
  } catch (err) {
    health.checks.database = 'error';
    health.status = 'degraded';
  }

  if (health.checks.mongodb !== 'connected') {
    health.status = 'degraded';
  }

  // Check blockchain config
  try {
    const { rpcUrl, contractAddress } = require('./config/env').blockchain;
    if (rpcUrl && contractAddress) {
      health.checks.blockchain = 'configured';
    } else {
      health.checks.blockchain = 'not configured';
      health.status = 'degraded';
    }
  } catch (err) {
    health.checks.blockchain = 'error';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

// ============================================
// API ROUTES
// ============================================

app.use('/api/auth', authRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/cooperatives', cooperativeRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/prices', priceRoutes);
app.use('/api/ussd', ussdRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/offers', harvestOfferRoutes);
app.use('/api/harvest-offers', harvestOfferRoutes);
// ============================================
// ERROR HANDLING
// ============================================

app.use(notFound);
app.use(errorHandler);

module.exports = app;
