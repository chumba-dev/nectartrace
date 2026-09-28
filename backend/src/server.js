const app = require('./app');
const prisma = require('./config/db');
const logger = require('./utils/logger');
const env = require('./config/env');

async function start() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('✅ Database connected');

    // Start server
    const server = app.listen(env.port, () => {
      logger.info(`🚀 NectarTrace API running on http://localhost:${env.port}`);
      logger.info(`🏥 Health check: http://localhost:${env.port}/api/health`);
      logger.info(`🌍 Environment: ${env.nodeEnv}`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down gracefully...`);
      server.close(async () => {
        await prisma.$disconnect();
        logger.info('✅ Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

start();