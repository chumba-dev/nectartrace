const app = require('./app');
const prisma = require('./config/db');
const logger = require('./utils/logger');
const env = require('./config/env');
const { connectMongo, disconnectMongo } = require('./config/mongo');
const {
  startExpireOffersJob,
  stopExpireOffersJob,
} = require('./jobs/expireOffers');

async function start() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('✅ Database connected');

    await connectMongo();
    logger.info('MongoDB connected');
    startExpireOffersJob();

    // Start server
    const server = app.listen(env.port, () => {
      logger.info(`🚀 NectarTrace API running on http://localhost:${env.port}`);
      logger.info(`🏥 Health check: http://localhost:${env.port}/api/health`);
      logger.info(`🌍 Environment: ${env.nodeEnv}`);
    });

    // Graceful shutdown
    let shuttingDown = false;
    const shutdown = async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info(`${signal} received — shutting down gracefully...`);
      stopExpireOffersJob();
      server.close(async () => {
        await Promise.allSettled([
          prisma.$disconnect(),
          disconnectMongo(),
        ]);
        logger.info('✅ Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    stopExpireOffersJob();
    await Promise.allSettled([
      prisma.$disconnect(),
      disconnectMongo(),
    ]);
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

start();
