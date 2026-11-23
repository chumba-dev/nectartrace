const mockExpireDueOffers = jest.fn();

jest.mock('../src/services/offerService', () => ({
  expireDueOffers: mockExpireDueOffers,
}));
jest.mock('../src/config/env', () => ({
  offers: { expiryIntervalMs: 60000 },
}));
jest.mock('../src/utils/logger', () => ({
  error: jest.fn(),
}));

const {
  runExpireOffers,
  startExpireOffersJob,
  stopExpireOffersJob,
} = require('../src/jobs/expireOffers');

afterEach(() => {
  stopExpireOffersJob();
  jest.restoreAllMocks();
  jest.resetAllMocks();
});

test('single-run expiry returns the number of transitioned offers', async () => {
  mockExpireDueOffers.mockResolvedValue(4);

  await expect(runExpireOffers()).resolves.toEqual({
    skipped: false,
    expiredCount: 4,
  });
});

test('the unrefd interval prevents overlapping expiry runs', async () => {
  let intervalCallback;
  let resolveExpiry;
  const timer = { unref: jest.fn() };
  jest.spyOn(global, 'setInterval').mockImplementation((callback) => {
    intervalCallback = callback;
    return timer;
  });
  jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
  mockExpireDueOffers.mockImplementation(() => new Promise((resolve) => {
    resolveExpiry = resolve;
  }));

  expect(startExpireOffersJob(5000)).toBe(timer);
  expect(timer.unref).toHaveBeenCalledTimes(1);
  intervalCallback();
  intervalCallback();

  expect(mockExpireDueOffers).toHaveBeenCalledTimes(1);
  resolveExpiry(1);
  await Promise.resolve();
  await Promise.resolve();

  stopExpireOffersJob();
  expect(global.clearInterval).toHaveBeenCalledWith(timer);
});
