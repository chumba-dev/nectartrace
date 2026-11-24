const { ethers } = require('ethers');
const { LOT_ID_DELIMITER, computeLotIdsHash } = require('../src/utils/lotIdsHash');

const firstId = 2;
const secondId = 11;

test('lot hash is order-independent and uses numerically sorted decimal IDs joined by newline', () => {
  const expectedPreimage = ['2', '11'].join('\n');
  const expected = ethers.keccak256(ethers.toUtf8Bytes(expectedPreimage));

  expect(computeLotIdsHash([secondId, firstId])).toBe(expected);
  expect(computeLotIdsHash(['11', '2'])).toBe(expected);
  expect(LOT_ID_DELIMITER).toBe('\n');
});

test('lot hash rejects duplicates after integer canonicalization', () => {
  expect(() => computeLotIdsHash([firstId, String(firstId)]))
    .toThrow('Lot IDs must be unique');
});

test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '01', 'not-an-id'])(
  'lot hash rejects invalid ID %p',
  (invalid) => {
    expect(() => computeLotIdsHash([invalid])).toThrow('Lot IDs must be positive safe integers');
  }
);

test('lot hash exposes only a fixed-size commitment', () => {
  const result = computeLotIdsHash([firstId, secondId]);

  expect(result).toMatch(/^0x[a-f0-9]{64}$/);
  expect(result).toHaveLength(66);
});
