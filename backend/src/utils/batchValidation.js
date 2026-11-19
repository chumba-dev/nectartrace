const BATCH_ID_PATTERN = /^BAR-\d{4}-\d{3}$/;
const MOISTURE_PATTERN = /^\d+(?:\.\d)?$/;

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
  const normalizedBatchId = typeof input.batchId === 'string' ? input.batchId.trim() : '';
  const normalizedVillage = typeof input.village === 'string' ? input.village.trim() : '';
  const parsedHarvestDate = parseHarvestDate(input.harvestDate);
  const moistureText = String(input.moisturePercent ?? '').trim();
  const parsedMoisture = Number(moistureText);
  const parsedWeight = Number(input.weightKg);
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
  if (
    !MOISTURE_PATTERN.test(moistureText)
    || !Number.isFinite(parsedMoisture)
    || parsedMoisture <= 0
    || parsedMoisture >= 100
  ) {
    return {
      error: 'moisturePercent must be greater than 0 and less than 100 with at most one decimal place',
    };
  }
  if (!Number.isInteger(parsedWeight) || parsedWeight < 1) {
    return { error: 'weightKg must be a whole number of kilograms and at least 1' };
  }
  if (hasPrice && (!Number.isFinite(parsedPrice) || parsedPrice <= 0)) {
    return { error: 'pricePerKg must be greater than 0 when supplied' };
  }

  return {
    value: {
      batchId: normalizedBatchId,
      village: normalizedVillage,
      harvestDate: parsedHarvestDate,
      harvestDateText: input.harvestDate,
      moisturePercent: parsedMoisture,
      weightKg: parsedWeight,
      pricePerKg: parsedPrice,
    },
  };
}

module.exports = { validateBatchInput };
