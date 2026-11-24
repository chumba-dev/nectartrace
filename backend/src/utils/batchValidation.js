const BATCH_ID_PATTERN = /^BAR-\d{4}-\d{3}$/;
const { computeLotIdsHash } = require('./lotIdsHash');

function parseHarvestDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  return value <= today ? date : null;
}

function validateBatchInput(input) {
  if (!input || typeof input !== 'object') {
    return { error: 'A batch request body is required' };
  }

  const normalizedBatchId = typeof input.batchId === 'string' ? input.batchId.trim() : '';
  const normalizedVillage = typeof input.village === 'string' ? input.village.trim() : '';
  const harvestDateText = typeof input.harvestDate === 'string' ? input.harvestDate.trim() : '';
  const parsedHarvestDate = parseHarvestDate(harvestDateText);
  const hasPrice = input.pricePerKg !== undefined
    && input.pricePerKg !== null
    && String(input.pricePerKg).trim() !== '';
  const parsedPrice = hasPrice ? Number(input.pricePerKg) : null;

  if (!BATCH_ID_PATTERN.test(normalizedBatchId)) {
    return { error: 'batchId must match BAR-YYYY-NNN exactly' };
  }
  if (!normalizedVillage || normalizedVillage.length > 120) {
    return { error: 'village is required and must not exceed 120 characters' };
  }
  if (!parsedHarvestDate) {
    return { error: 'harvestDate must be a valid date that is not in the future' };
  }
  if (hasPrice && (!Number.isFinite(parsedPrice) || parsedPrice <= 0)) {
    return { error: 'pricePerKg must be greater than 0 when supplied' };
  }

  if (!Array.isArray(input.offerIds) || input.offerIds.length === 0) {
    return { error: 'offerIds must be a nonempty array of positive integer Offer IDs' };
  }
  const offerIds = Array.from(input.offerIds, (value) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && /^[1-9]\d*$/.test(value.trim())) {
      return Number(value.trim());
    }
    return NaN;
  });
  if (offerIds.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    return { error: 'offerIds must contain only positive safe integer Offer IDs' };
  }
  try {
    computeLotIdsHash(offerIds);
  } catch (err) {
    return { error: err.message };
  }

  return {
    value: {
      batchId: normalizedBatchId,
      village: normalizedVillage,
      harvestDate: parsedHarvestDate,
      harvestDateText,
      pricePerKg: parsedPrice,
      offerIds,
    },
  };
}

module.exports = { validateBatchInput };
