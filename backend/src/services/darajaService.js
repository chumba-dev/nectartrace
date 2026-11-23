const env = require('../config/env');

const SANDBOX_HOST = 'sandbox.safaricom.co.ke';
const TOKEN_EXPIRY_SKEW_SECONDS = 60;
const DEFAULT_TIMEOUT_MS = 10000;

class DarajaServiceError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'DarajaServiceError';
    this.code = code;
  }
}

function sandboxBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value || '');
  } catch (err) {
    throw new DarajaServiceError('Daraja sandbox base URL is invalid', 'INVALID_DARAJA_BASE_URL');
  }

  // Live payouts are future work; Step 4 must never send a request outside the sandbox.
  if (
    parsed.protocol !== 'https:'
    || parsed.hostname.toLowerCase() !== SANDBOX_HOST
    || (parsed.port && parsed.port !== '443')
    || parsed.username
    || parsed.password
  ) {
    throw new DarajaServiceError(
      'Only the Daraja sandbox base URL is allowed',
      'DARAJA_SANDBOX_ONLY'
    );
  }
  return parsed.origin;
}

function requiredConfig(config) {
  const required = [
    'consumerKey',
    'consumerSecret',
    'shortcode',
    'initiatorName',
    'securityCredential',
    'resultUrl',
    'timeoutUrl',
  ];
  if (required.some((key) => typeof config?.[key] !== 'string' || !config[key].trim())) {
    throw new DarajaServiceError(
      'Daraja sandbox configuration is incomplete',
      'DARAJA_NOT_CONFIGURED'
    );
  }
}

function safeText(value, name, maxLength = 100) {
  const normalized = typeof value === 'string'
    ? value.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
  if (!normalized || normalized.length > maxLength) {
    throw new DarajaServiceError(`${name} is invalid`, 'INVALID_DARAJA_REQUEST');
  }
  return normalized;
}

function normalizePartyB(value) {
  if (typeof value !== 'string') {
    throw new DarajaServiceError('M-Pesa number is invalid', 'INVALID_MPESA_NUMBER');
  }
  const compact = value.trim().replace(/[\s()-]/g, '');
  let normalized = compact;
  if (/^0\d{9}$/.test(compact)) normalized = `254${compact.slice(1)}`;
  if (/^\+254\d{9}$/.test(compact)) normalized = compact.slice(1);
  if (!/^254\d{9}$/.test(normalized)) {
    throw new DarajaServiceError('M-Pesa number is invalid', 'INVALID_MPESA_NUMBER');
  }
  return normalized;
}

function successfulResponse(response) {
  if (typeof response?.ok === 'boolean') return response.ok;
  return Number.isInteger(response?.status) && response.status >= 200 && response.status < 300;
}

async function jsonResponse(response) {
  try {
    return await response.json();
  } catch (err) {
    throw new DarajaServiceError('Daraja returned an invalid response', 'DARAJA_INVALID_RESPONSE');
  }
}

function createDarajaService({
  fetchImpl = (...args) => globalThis.fetch(...args),
  config = env.daraja,
  now = () => Date.now(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  let tokenCache = null;

  async function fetchWithTimeout(url, options) {
    if (typeof fetchImpl !== 'function') {
      throw new DarajaServiceError('Fetch is unavailable', 'DARAJA_FETCH_UNAVAILABLE');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { ...options, signal: controller.signal });
    } catch (err) {
      throw new DarajaServiceError('Daraja request did not complete', 'DARAJA_REQUEST_FAILED');
    } finally {
      clearTimeout(timer);
    }
  }

  async function getAccessToken() {
    requiredConfig(config);
    const baseUrl = sandboxBaseUrl(config.baseUrl);
    const currentTime = Number(now());
    if (tokenCache && tokenCache.expiresAt > currentTime) return tokenCache.value;

    const credentials = Buffer.from(
      `${config.consumerKey}:${config.consumerSecret}`,
      'utf8'
    ).toString('base64');
    const response = await fetchWithTimeout(
      `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${credentials}`,
        },
      }
    );
    if (!successfulResponse(response)) {
      throw new DarajaServiceError('Daraja authentication failed', 'DARAJA_AUTH_FAILED');
    }
    const body = await jsonResponse(response);
    const accessToken = typeof body.access_token === 'string' ? body.access_token.trim() : '';
    const expiresIn = Number(body.expires_in);
    if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new DarajaServiceError('Daraja authentication failed', 'DARAJA_AUTH_FAILED');
    }
    const usableSeconds = Math.max(1, expiresIn - TOKEN_EXPIRY_SKEW_SECONDS);
    tokenCache = {
      value: accessToken,
      expiresAt: currentTime + usableSeconds * 1000,
    };
    return accessToken;
  }

  async function requestB2CPayout({ amount, partyB, reference, remarks }) {
    requiredConfig(config);
    const baseUrl = sandboxBaseUrl(config.baseUrl);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new DarajaServiceError('Amount must be a positive whole KES value', 'INVALID_DARAJA_AMOUNT');
    }
    const safeReference = safeText(reference, 'Reference', 80);
    const safeRemarks = safeText(
      remarks || `NectarTrace payout ${safeReference}`,
      'Remarks',
      100
    );
    const token = await getAccessToken();
    const payload = {
      InitiatorName: config.initiatorName,
      SecurityCredential: config.securityCredential,
      CommandID: 'BusinessPayment',
      Amount: amount,
      PartyA: String(config.shortcode),
      PartyB: normalizePartyB(partyB),
      Remarks: safeRemarks,
      QueueTimeOutURL: config.timeoutUrl,
      ResultURL: config.resultUrl,
      Occasion: safeReference,
    };

    const response = await fetchWithTimeout(`${baseUrl}/mpesa/b2c/v3/paymentrequest`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!successfulResponse(response)) {
      throw new DarajaServiceError('Daraja payout request failed', 'DARAJA_REQUEST_FAILED');
    }
    const body = await jsonResponse(response);
    if (String(body.ResponseCode ?? '') !== '0') {
      throw new DarajaServiceError('Daraja did not accept the payout', 'DARAJA_REQUEST_REJECTED');
    }

    return {
      originatorConversationId: body.OriginatorConversationID || null,
      conversationId: body.ConversationID || null,
      responseCode: body.ResponseCode,
      responseDescription: body.ResponseDescription || null,
    };
  }

  function clearTokenCache() {
    tokenCache = null;
  }

  return {
    clearTokenCache,
    getAccessToken,
    requestB2CPayout,
  };
}

const defaultService = createDarajaService();

module.exports = {
  DarajaServiceError,
  SANDBOX_HOST,
  createDarajaService,
  getAccessToken: defaultService.getAccessToken,
  initiateB2CPayment: defaultService.requestB2CPayout,
  normalizePartyB,
  requestB2CPayout: defaultService.requestB2CPayout,
  sandboxBaseUrl,
};
