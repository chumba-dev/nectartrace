const logger = require('../utils/logger');
const menu = require('../services/ussdMenu');
const handlers = require('../services/ussdHandlers');

/**
 * Main USSD handler
 * Africa's Talking sends POST requests on each user input
 */
async function handleUSSD(req, res, next) {
  const startTime = Date.now();

  try {
    const { sessionId, phoneNumber, text } = req.body;

    // Validate required fields
    if (!sessionId || !phoneNumber) {
      return res.send(menu.errorMessage('Invalid request'));
    }

    // Parse input path: "1*15" → ["1", "15"]
    const inputs = text ? text.split('*') : [];
    logger.info('USSD request', { sessionId, inputCount: inputs.length });

    // Route based on first input
    let response;

    if (inputs.length === 0) {
      // Main menu (first dial)
      response = menu.mainMenu();
    } else if (inputs[0] === '1') {
      response = await handlers.handleLogHarvest(inputs, phoneNumber, sessionId);
    } else if (inputs[0] === '2') {
      response = await handlers.handleCheckPrice(phoneNumber);
    } else if (inputs[0] === '3') {
      response = await handlers.handleMyAccount(phoneNumber);
    } else if (inputs[0] === '4') {
      response = await handlers.handleHarvestOffer(inputs, phoneNumber, sessionId);
    } else {
      response = menu.errorMessage('Invalid option. Please try again.');
    }

    const elapsed = Date.now() - startTime;
    logger.info('USSD response', {
      sessionId,
      elapsedMs: elapsed,
    });

    // Warn if slow
    if (elapsed > 4000) {
      logger.warn('USSD slow response', { sessionId, elapsedMs: elapsed });
    }

    res.send(response);
  } catch (err) {
    logger.error('USSD handler error', {
      error: err.message,
      stack: err.stack,
    });

    // Always return valid USSD response, never a 500
    res.send(menu.errorMessage('Service temporarily unavailable. Try again.'));
  }
}

module.exports = { handleUSSD };
