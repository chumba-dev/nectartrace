const { ethers } = require('ethers');
const { LOT_ID_DELIMITER, computeLotIdsHash } = require('../src/utils/lotIdsHash');

const firstId = '64b64c2f3f3f3f3f3f3f3f3f';
const secondId = '74b64c2f3f3f3f3f3f3f3f3f';

test('lot hash is order-independent and uses sorted lowercase IDs joined by newline', () => {
  const expectedPreimage = [firstId, secondId].join('\n');
  const expected = ethers.keccak256(ethers.toUtf8Bytes(expectedPreimage));

  expect(computeLotIdsHash([secondId.toUpperCase(), firstId])).toBe(expected);
  expect(computeLotIdsHash([firstId, secondId])).toBe(expected);
  expect(LOT_ID_DELIMITER).toBe('\n');
});

test('lot hash rejects duplicate canonical ObjectIds', () => {
  expect(() => computeLotIdsHash([firstId, firstId.toUpperCase()]))
    .toThrow('Lot IDs must be unique');
});

test('lot hash result contains no raw Mongo ObjectId', () => {
  const result = computeLotIdsHash([firstId, secondId]);

  expect(result).toMatch(/^0x[a-f0-9]{64}$/);
  expect(result).not.toContain(firstId);
  expect(result).not.toContain(secondId);
});
