const {
  createDarajaService,
  normalizePartyB,
} = require('../src/services/darajaService');

const config = {
  baseUrl: 'https://sandbox.safaricom.co.ke',
  consumerKey: 'sandbox-key',
  consumerSecret: 'sandbox-secret',
  shortcode: '600000',
  initiatorName: 'sandbox-initiator',
  securityCredential: 'sandbox-encrypted-credential',
  resultUrl: 'https://example.test/api/payments/daraja/result',
  timeoutUrl: 'https://example.test/api/payments/daraja/timeout',
};

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(body),
  };
}

test('Daraja client caches OAuth and sends a normalized BusinessPayment payload', async () => {
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce(jsonResponse({ access_token: 'token-one', expires_in: 3600 }))
    .mockResolvedValueOnce(jsonResponse({
      ResponseCode: '0',
      ResponseDescription: 'Accepted',
      OriginatorConversationID: 'origin-1',
      ConversationID: 'conversation-1',
    }))
    .mockResolvedValueOnce(jsonResponse({
      ResponseCode: '0',
      ResponseDescription: 'Accepted',
      OriginatorConversationID: 'origin-2',
      ConversationID: 'conversation-2',
    }));
  const client = createDarajaService({
    fetchImpl,
    config,
    now: () => 1000,
  });

  const first = await client.requestB2CPayout({
    amount: 1250,
    partyB: '+254712345678',
    reference: 'PAY-ONE',
  });
  await client.requestB2CPayout({
    amount: 500,
    partyB: '0712345678',
    reference: 'PAY-TWO',
  });

  expect(first).toEqual(expect.objectContaining({
    originatorConversationId: 'origin-1',
    conversationId: 'conversation-1',
  }));
  expect(fetchImpl).toHaveBeenCalledTimes(3);
  expect(fetchImpl.mock.calls[0][0]).toContain('/oauth/v1/generate?grant_type=client_credentials');
  expect(fetchImpl.mock.calls[1][0]).toBe(
    'https://sandbox.safaricom.co.ke/mpesa/b2c/v3/paymentrequest'
  );
  const payload = JSON.parse(fetchImpl.mock.calls[1][1].body);
  expect(payload).toEqual(expect.objectContaining({
    CommandID: 'BusinessPayment',
    Amount: 1250,
    PartyA: '600000',
    PartyB: '254712345678',
    ResultURL: config.resultUrl,
    QueueTimeOutURL: config.timeoutUrl,
    Occasion: 'PAY-ONE',
  }));
  expect(payload).not.toHaveProperty('ConsumerSecret');
});

test('Daraja client rejects a live base URL before fetch', async () => {
  const fetchImpl = jest.fn();
  const client = createDarajaService({
    fetchImpl,
    config: { ...config, baseUrl: 'https://api.safaricom.co.ke' },
  });

  await expect(client.getAccessToken()).rejects.toMatchObject({
    code: 'DARAJA_SANDBOX_ONLY',
  });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test.each([
  ['+254712345678', '254712345678'],
  ['254712345678', '254712345678'],
  ['0712345678', '254712345678'],
])('normalizes Daraja PartyB %s', (input, expected) => {
  expect(normalizePartyB(input)).toBe(expected);
});
