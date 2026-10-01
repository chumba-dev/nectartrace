const AfricasTalking = require('africastalking');
const env = require('./env');
const logger = require('../utils/logger');

let at = null;
let sms = null;

function initialize() {
  if (at) return { at, sms };

  try {
    at = AfricasTalking({
      apiKey: env.africasTalking.apiKey,
      username: env.africasTalking.username,
    });

    sms = at.SMS;
    logger.info('Africa\'s Talking initialized', {
      username: env.africasTalking.username,
    });

    return { at, sms };
  } catch (err) {
    logger.error('Failed to initialize Africa\'s Talking', {
      error: err.message,
    });
    throw err;
  }
}

function getSMS() {
  if (!sms) initialize();
  return sms;
}

module.exports = { initialize, getSMS };