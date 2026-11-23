const env = require('../config/env');
const logger = require('../utils/logger');
const { expireDueOffers } = require('../services/offerService');

let interval = null;
let runInProgress = false;

async function runExpireOffers() {
  if (runInProgress) return { skipped: true, expiredCount: 0 };

  runInProgress = true;
  try {
    const expiredCount = await expireDueOffers();
    return { skipped: false, expiredCount };
  } finally {
    runInProgress = false;
  }
}

function startExpireOffersJob(intervalMs = env.offers.expiryIntervalMs) {
  if (interval) return interval;

  interval = setInterval(() => {
    runExpireOffers().catch(() => {
      logger.error('Offer expiry job failed');
    });
  }, intervalMs);
  interval.unref();
  return interval;
}

function stopExpireOffersJob() {
  if (!interval) return;
  clearInterval(interval);
  interval = null;
}

module.exports = {
  runExpireOffers,
  startExpireOffersJob,
  stopExpireOffersJob,
};
