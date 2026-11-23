const { ethers } = require('ethers');

// A newline is the canonical separator; Mongo ObjectId hex strings never contain it.
const LOT_ID_DELIMITER = '\n';
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/;

function computeLotIdsHash(lotIds) {
  if (!Array.isArray(lotIds) || lotIds.length === 0) {
    throw new TypeError('At least one lot ID is required');
  }

  const canonicalIds = Array.from(lotIds, (value) => (
    typeof value === 'string' ? value.trim().toLowerCase() : ''
  ));
  if (canonicalIds.some((value) => !OBJECT_ID_PATTERN.test(value))) {
    throw new TypeError('Lot IDs must be 24-character Mongo ObjectId strings');
  }

  canonicalIds.sort();
  if (canonicalIds.some((value, index) => index > 0 && value === canonicalIds[index - 1])) {
    throw new TypeError('Lot IDs must be unique');
  }

  return ethers.keccak256(ethers.toUtf8Bytes(canonicalIds.join(LOT_ID_DELIMITER)));
}

module.exports = {
  LOT_ID_DELIMITER,
  computeLotIdsHash,
};
