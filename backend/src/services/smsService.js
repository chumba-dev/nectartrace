const { getSMS } = require('../config/africastalking');
const prisma = require('../config/db');
const logger = require('../utils/logger');
const env = require('../config/env');

/**
 * Send an SMS via Africa's Talking
 * Logs the message in the database
 */
async function sendSMS(phoneNumber, message) {
  let status = 'sent';
  let error = null;

  try {
    const sms = getSMS();

    const result = await sms.send({
      to: [phoneNumber],
      message,
      from: env.africasTalking.senderId || 'NectarTrace',
    });

    logger.info('SMS sent', { phoneNumber, message: message.substring(0, 50) });

    return result;
  } catch (err) {
    status = 'failed';
    error = err.message;
    logger.error('SMS failed', { phoneNumber, error: err.message });
    throw err;
  } finally {
    // Log to database regardless of success
    try {
      await prisma.smsLog.create({
        data: {
          phoneNumber,
          message,
          status,
          error,
        },
      });
    } catch (logErr) {
      logger.error('Failed to log SMS', { error: logErr.message });
    }
  }
}

/**
 * Send harvest confirmation SMS
 */
async function sendHarvestConfirmation(phoneNumber, weightKg, totalThisMonth) {
  const message = `NectarTrace: Harvest of ${weightKg}kg recorded. Total this month: ${totalThisMonth}kg.`;
  return sendSMS(phoneNumber, message);
}

/**
 * Send listing confirmation SMS
 */
async function sendListingConfirmation(phoneNumber, quantityKg, pricePerKg) {
  const message = `NectarTrace: Listed ${quantityKg}kg at KES ${pricePerKg}/kg. Buyers can now see your honey.`;
  return sendSMS(phoneNumber, message);
}

/**
 * Send generic notification
 */
async function sendNotification(phoneNumber, message) {
  return sendSMS(phoneNumber, message);
}

module.exports = {
  sendSMS,
  sendHarvestConfirmation,
  sendListingConfirmation,
  sendNotification,
};