const { ethers } = require('ethers');

// Decimal integer IDs are sorted numerically and separated unambiguously by newlines.
const LOT_ID_DELIMITER = '\n';

function parseLotId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function computeLotIdsHash(lotIds) {
  if (!Array.isArray(lotIds) || lotIds.length === 0) {
    throw new TypeError('At least one lot ID is required');
  }

  const numericIds = Array.from(lotIds, parseLotId);
  if (numericIds.some((value) => value === null)) {
    throw new TypeError('Lot IDs must be positive safe integers');
  }

  numericIds.sort((left, right) => left - right);
  if (numericIds.some((value, index) => index > 0 && value === numericIds[index - 1])) {
    throw new TypeError('Lot IDs must be unique');
  }

  const canonicalIds = numericIds.map(String);
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalIds.join(LOT_ID_DELIMITER)));
}

module.exports = {
  LOT_ID_DELIMITER,
  computeLotIdsHash,
};
