const crypto = require('crypto');
const prisma = require('../config/db');
const env = require('../config/env');

const SESSION_DATA_VERSION = 1;
const MAX_CUMULATIVE_TEXT_LENGTH = 2000;
const MAX_TOKENS = 64;
const REDACTED_TOKEN = '[redacted]';

class UssdSessionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'UssdSessionError';
    this.code = code;
  }
}

function initialData() {
  return {
    version: SESSION_DATA_VERSION,
    terminal: false,
    context: {},
    tokenDigests: [],
    sensitiveTokenIndexes: [],
    lastProcessedText: null,
    lastEventDigest: null,
    cachedResponse: null,
  };
}

function readData(session) {
  const data = session?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return initialData();
  return {
    ...initialData(),
    ...data,
    context: data.context && typeof data.context === 'object' && !Array.isArray(data.context)
      ? data.context
      : {},
    tokenDigests: Array.isArray(data.tokenDigests) ? data.tokenDigests : [],
    sensitiveTokenIndexes: Array.isArray(data.sensitiveTokenIndexes)
      ? data.sensitiveTokenIndexes.filter(Number.isSafeInteger)
      : [],
  };
}

function signingKey() {
  const key = env.ussd?.eventSecret || env.jwt?.secret;
  if (!key) {
    throw new UssdSessionError(
      'SESSION_SECRET_MISSING',
      'USSD event signing is unavailable'
    );
  }
  return key;
}

function digest(sessionId, scope, value) {
  return crypto
    .createHmac('sha256', signingKey())
    .update(sessionId)
    .update('\0')
    .update(scope)
    .update('\0')
    .update(value)
    .digest('base64url');
}

async function openSession(sessionId, phoneNumber) {
  const session = await prisma.ussdSession.upsert({
    where: { id: sessionId },
    create: {
      id: sessionId,
      phoneNumber,
      data: initialData(),
    },
    update: {},
  });

  if (session.phoneNumber !== phoneNumber) {
    throw new UssdSessionError(
      'SESSION_PHONE_MISMATCH',
      'This session belongs to a different phone'
    );
  }
  return session;
}

function prepareEvent(session, cumulativeText) {
  if (typeof cumulativeText !== 'string') {
    throw new UssdSessionError('INVALID_TEXT', 'USSD text must be a string');
  }
  if (cumulativeText.length > MAX_CUMULATIVE_TEXT_LENGTH) {
    throw new UssdSessionError('TEXT_TOO_LONG', 'USSD text is too long');
  }

  const tokens = cumulativeText === '' ? [] : cumulativeText.split('*');
  if (tokens.length > MAX_TOKENS) {
    throw new UssdSessionError('TOO_MANY_TOKENS', 'USSD input has too many steps');
  }

  const data = readData(session);
  const tokenDigests = tokens.map((token, index) => (
    digest(session.id, `token:${index}`, token)
  ));
  const eventDigest = digest(session.id, 'event', cumulativeText);

  if (
    data.lastEventDigest === eventDigest
    && data.tokenDigests.length === tokenDigests.length
    && typeof data.cachedResponse === 'string'
  ) {
    return { kind: 'retry', response: data.cachedResponse };
  }

  if (data.terminal) {
    throw new UssdSessionError('TERMINAL_REPLAY', 'The USSD session has ended');
  }
  if (tokenDigests.length < data.tokenDigests.length) {
    throw new UssdSessionError('DIVERGENT_REPLAY', 'USSD history moved backwards');
  }
  for (let index = 0; index < data.tokenDigests.length; index += 1) {
    if (data.tokenDigests[index] !== tokenDigests[index]) {
      throw new UssdSessionError('DIVERGENT_REPLAY', 'USSD history has changed');
    }
  }

  return {
    kind: 'new',
    tokens,
    tokenDigests,
    eventDigest,
    newTokens: tokens.slice(data.tokenDigests.length),
    firstNewTokenIndex: data.tokenDigests.length,
    data,
  };
}

function sanitizedCumulativeText(tokens, sensitiveTokenIndexes) {
  const sensitive = new Set(sensitiveTokenIndexes);
  return tokens
    .map((token, index) => (sensitive.has(index) ? REDACTED_TOKEN : token))
    .join('*');
}

async function persistEvent({
  session,
  event,
  currentStep,
  context,
  terminal,
  response,
  sensitiveTokenIndexes,
}) {
  const indexes = [...new Set(sensitiveTokenIndexes)].sort((left, right) => left - right);
  const data = {
    version: SESSION_DATA_VERSION,
    terminal: Boolean(terminal),
    context: context || {},
    tokenDigests: event.tokenDigests,
    sensitiveTokenIndexes: indexes,
    lastProcessedText: sanitizedCumulativeText(event.tokens, indexes),
    lastEventDigest: event.eventDigest,
    cachedResponse: response,
  };

  const result = await prisma.ussdSession.updateMany({
    where: {
      id: session.id,
      phoneNumber: session.phoneNumber,
      updatedAt: session.updatedAt,
    },
    data: {
      currentStep,
      data,
    },
  });
  if (result.count === 1) return response;

  const latest = await prisma.ussdSession.findUnique({ where: { id: session.id } });
  const latestData = readData(latest);
  if (
    latest?.phoneNumber === session.phoneNumber
    && latestData.lastEventDigest === event.eventDigest
    && typeof latestData.cachedResponse === 'string'
  ) {
    return latestData.cachedResponse;
  }

  throw new UssdSessionError('SESSION_CONFLICT', 'USSD session changed concurrently');
}

module.exports = {
  SESSION_DATA_VERSION,
  UssdSessionError,
  initialData,
  openSession,
  persistEvent,
  prepareEvent,
  readData,
};
