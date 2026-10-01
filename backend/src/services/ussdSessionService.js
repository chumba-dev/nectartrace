const prisma = require('../config/db');
const logger = require('../utils/logger');

/**
 * Get or create a session
 */
async function getSession(sessionId, phoneNumber) {
  let session = await prisma.ussdSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    session = await prisma.ussdSession.create({
      data: {
        id: sessionId,
        phoneNumber,
      },
    });
  }

  return session;
}

/**
 * Update session state
 */
async function updateSession(sessionId, currentStep, data = null) {
  return prisma.ussdSession.update({
    where: { id: sessionId },
    data: {
      currentStep,
      ...(data && { data }),
    },
  });
}

/**
 * Delete session (when USSD ends)
 */
async function clearSession(sessionId) {
  try {
    await prisma.ussdSession.delete({
      where: { id: sessionId },
    });
  } catch (err) {
    // Session may already be deleted — ignore
    logger.warn('Failed to delete session', { sessionId, error: err.message });
  }
}

module.exports = { getSession, updateSession, clearSession };