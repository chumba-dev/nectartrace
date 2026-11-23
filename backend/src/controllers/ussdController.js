const logger = require('../utils/logger');
const menu = require('../services/ussdMenu');
const { processUssdEvent } = require('../services/ussdHandlers');

async function handleUSSD(req, res) {
  const startTime = Date.now();
  const body = req.body || {};
  const text = typeof body.text === 'string' ? body.text : '';
  const tokenCount = text === '' ? 0 : text.split('*').length;

  try {
    logger.info('USSD request', { tokenCount });
    const response = await processUssdEvent({
      sessionId: body.sessionId,
      phoneNumber: body.phoneNumber,
      text,
    });
    const elapsedMs = Date.now() - startTime;
    logger.info('USSD response', { elapsedMs });
    if (elapsedMs > 4000) logger.warn('USSD slow response', { elapsedMs });
    return res.type('text/plain').send(response);
  } catch (err) {
    logger.error('USSD handler error', { code: err?.code || 'UNEXPECTED' });
    return res
      .type('text/plain')
      .send(menu.end('Service temporarily unavailable. Please try again.'));
  }
}

module.exports = { handleUSSD };
