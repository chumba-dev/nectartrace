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

    const payload = {
      to: [phoneNumber],
      message,
      ...(env.africasTalking.senderId && {
        from: env.africasTalking.senderId,
      }),
    };
    const result = await sms.send(payload);

    logger.info('SMS sent');

    return result;
  } catch (err) {
    status = 'failed';
    error = err.message;
    logger.error('SMS failed');
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
      logger.error('Failed to log SMS');
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
 * Send harvest-offer confirmation SMS
 */
async function sendHarvestOfferConfirmation(phoneNumber, reference, cooperativeName) {
  const message = `NectarTrace: Offer ${reference} was submitted to ${cooperativeName}.`;
  return sendSMS(phoneNumber, message);
}

function safeOfferReference(reference) {
  const normalized = typeof reference === 'string' ? reference.trim() : '';
  if (!normalized || normalized.length > 80 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)) {
    throw new TypeError('A valid offer reference is required');
  }
  return normalized;
}

function kesAmount(value, { positive = false, whole = false } = {}) {
  const amount = Number(value);
  if (
    !Number.isFinite(amount)
    || (positive ? amount <= 0 : amount < 0)
    || (whole && !Number.isSafeInteger(amount))
  ) {
    throw new TypeError('A valid KES amount is required');
  }
  return Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function safeDescription(value) {
  const description = typeof value === 'string'
    ? value.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
  return description ? description.slice(0, 120) : 'Please contact your cooperative.';
}

async function sendOfferAccepted(
  phoneNumber,
  { reference, tradeType, agreedPricePerKg, commissionPercent }
) {
  const safeReference = safeOfferReference(reference);
  let message;
  if (tradeType === 'direct') {
    const price = Number(agreedPricePerKg);
    if (!Number.isFinite(price) || price <= 0) {
      throw new TypeError('A positive agreed price is required for direct offers');
    }
    message = `NectarTrace: Offer ${safeReference} accepted at KES ${price} per kg before delivery. Deliver honey for weighing.`;
  } else if (tradeType === 'consignment') {
    const commission = Number(commissionPercent);
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      throw new TypeError('A valid commission snapshot is required for consignment offers');
    }
    message = `NectarTrace: Offer ${safeReference} accepted on consignment at ${commission}% commission. Deliver honey for weighing.`;
  } else {
    throw new TypeError('A valid offer trade type is required');
  }
  return sendSMS(phoneNumber, message);
}

async function sendOfferRejected(phoneNumber, { reference, rejectionReason }) {
  const safeReference = safeOfferReference(reference);
  const reason = typeof rejectionReason === 'string'
    ? rejectionReason.replace(/\s+/g, ' ').trim()
    : '';
  if (!reason || reason.length > 500) {
    throw new TypeError('A valid rejection reason is required');
  }
  return sendSMS(
    phoneNumber,
    `NectarTrace: Offer ${safeReference} was rejected. Reason: ${reason}`
  );
}

async function sendConsignmentSale(
  phoneNumber,
  { reference, saleAmount, commissionAmount, payoutAmount }
) {
  const safeReference = safeOfferReference(reference);
  const sale = kesAmount(saleAmount, { positive: true });
  const commission = kesAmount(commissionAmount);
  const payout = kesAmount(payoutAmount, { positive: true, whole: true });
  return sendSMS(
    phoneNumber,
    `NectarTrace: Consignment ${safeReference} sold. Sale KES ${sale}; commission KES ${commission}; payout KES ${payout}.`
  );
}

async function sendPayoutSuccess(phoneNumber, { reference, amount, transactionId }) {
  const safeReference = safeOfferReference(reference);
  const payout = kesAmount(amount, { positive: true, whole: true });
  const receipt = typeof transactionId === 'string'
    ? transactionId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)
    : '';
  return sendSMS(
    phoneNumber,
    `NectarTrace: Payout ${safeReference} of KES ${payout} succeeded${receipt ? ` (receipt ${receipt})` : ''}.`
  );
}

async function sendPayoutFailure(phoneNumber, { reference, amount, description }) {
  const safeReference = safeOfferReference(reference);
  const payout = kesAmount(amount, { positive: true, whole: true });
  return sendSMS(
    phoneNumber,
    `NectarTrace: Payout ${safeReference} of KES ${payout} failed. ${safeDescription(description)}`
  );
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
  sendHarvestOfferConfirmation,
  sendConsignmentSale,
  sendOfferAccepted,
  sendOfferRejected,
  sendPayoutFailure,
  sendPayoutSuccess,
  sendNotification,
};
