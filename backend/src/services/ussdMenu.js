const { USSD_PAGE_SIZE } = require('../config/baringoAreas');

const MAX_USSD_LENGTH = 180;

function truncateSafe(value, maxLength) {
  const text = String(value ?? '');
  if (text.length <= maxLength) return text;
  if (maxLength <= 1) return text.slice(0, maxLength);

  let truncated = text.slice(0, maxLength - 1);
  const lastCode = truncated.charCodeAt(truncated.length - 1);
  if (lastCode >= 0xD800 && lastCode <= 0xDBFF) truncated = truncated.slice(0, -1);
  return `${truncated}~`;
}

function safeText(value, maxLength = 40) {
  const normalized = String(value ?? '')
    .replace(/[\r\n*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return truncateSafe(normalized, maxLength);
}

function response(type, lines) {
  const body = (Array.isArray(lines) ? lines : [lines])
    .map((line) => String(line ?? '').replace(/\r/g, ''))
    .join('\n')
    .trim();
  const rendered = `${type} ${body}`;
  return rendered.length <= MAX_USSD_LENGTH
    ? rendered
    : truncateSafe(rendered, MAX_USSD_LENGTH);
}

function con(lines) {
  return response('CON', lines);
}

function end(lines) {
  return response('END', lines);
}

function mainMenu(error) {
  return con([
    ...(error ? [safeText(error, 40)] : []),
    'NectarTrace',
    '1 Log harvest',
    '2 Check prices',
    '3 My account',
    '4 Offer harvest to cooperative',
    '5 My offers',
  ]);
}

function numberedList({ title, items, page = 0, error }) {
  const start = page * USSD_PAGE_SIZE;
  const visible = items.slice(start, start + USSD_PAGE_SIZE);
  const itemLength = error ? 19 : 26;
  const lines = [
    ...(error ? [safeText(error, 20)] : []),
    safeText(title, error ? 30 : 36),
    ...visible.map((item, index) => `${index + 1} ${safeText(item, itemLength)}`),
  ];
  if (items.length > start + USSD_PAGE_SIZE) lines.push('98 More');
  lines.push('0 Back');
  return con(lines);
}

function optInName(error) {
  return con([
    ...(error ? [safeText(error, 42)] : []),
    'Welcome to NectarTrace farmer opt-in.',
    'Enter your full name:',
  ]);
}

function consent() {
  return con([
    'Consent to store your details for NectarTrace services?',
    '1 Yes',
    '2 No',
    '0 Back',
  ]);
}

function pin(error) {
  return con([
    ...(error ? [safeText(error, 44)] : []),
    'Create an exactly 4-digit USSD PIN:',
    '0 Back',
  ]);
}

function harvestWeight(error) {
  return con([
    ...(error ? [safeText(error, 44)] : []),
    'Enter harvest weight in kg (max 10000):',
    '0 Back',
  ]);
}

function marketPrice(gradeA, gradeB) {
  return end([
    'Current Nairobi honey prices:',
    `Grade A: KES ${safeText(gradeA, 20)}/kg`,
    `Grade B: KES ${safeText(gradeB, 20)}/kg`,
    'Updated today.',
  ]);
}

function harvestConfirmation(weightKg, totalThisMonth) {
  return end([
    `Harvest ${safeText(weightKg, 16)}kg recorded.`,
    `Month total: ${safeText(totalThisMonth, 16)}kg.`,
    'Confirmation sent by SMS.',
  ]);
}

function accountSummary(summary, error) {
  return con([
    ...(error ? [safeText(error, 18)] : []),
    'My account',
    `Name: ${safeText(summary.name, 14)}`,
    `Ward: ${safeText(summary.ward || 'Not set', 14)}`,
    `Month: ${safeText(summary.totalWeightKg, 9)}kg (~KES ${safeText(summary.estimatedEarnings, 10)})`,
    `Co-op: ${safeText(summary.cooperativeName || 'Not assigned', 14)}`,
    `M-Pesa: ${safeText(summary.maskedMpesa || 'Not set', 13)}`,
    '1 Change M-Pesa number',
    '0 Back',
  ]);
}

function accountPin(error) {
  return con([
    ...(error ? [safeText(error, 44)] : []),
    'Enter your 4-digit USSD PIN:',
    '0 Back',
  ]);
}

function mpesaNumber(error) {
  return con([
    ...(error ? [safeText(error, 44)] : []),
    'Enter Kenyan M-Pesa number:',
    'Example: 0712345678',
    '0 Back',
  ]);
}

function offerWeight(cooperativeName, error) {
  return con([
    ...(error ? [safeText(error, 42)] : []),
    safeText(cooperativeName, 34),
    'Enter kilograms (max 10000):',
    '0 Back',
  ]);
}

function expectedPrice(weightKg, error) {
  return con([
    ...(error ? [safeText(error, 42)] : []),
    `${safeText(weightKg, 18)}kg`,
    'Expected KES/kg (0 for any price)',
  ]);
}

function tradeType(error) {
  return con([
    ...(error ? [safeText(error, 42)] : []),
    'Trade type:',
    '1 direct',
    '2 consignment',
    '0 Back',
  ]);
}

function offerConfirmation(offer, error) {
  const price = offer.expectedPricePerKg === 0 ? 'Any' : offer.expectedPricePerKg;
  const type = offer.tradeType === 'consignment'
    ? `consignment; Comm ${safeText(offer.commissionPercent, 10)}%`
    : 'direct';
  return con([
    ...(error ? [safeText(error, 30)] : []),
    `Co-op: ${safeText(offer.cooperativeName, 30)}`,
    `${safeText(offer.offeredKg, 16)}kg; Price: ${safeText(price, 18)}`,
    `Type: ${type}`,
    '1 Confirm',
    '2 Cancel',
    '0 Back',
  ]);
}

function offerSubmitted(reference, cooperativeName) {
  return end(`Offer ${safeText(reference, 36)} submitted to ${safeText(cooperativeName, 54)}. SMS sent.`);
}

function offerPaymentDetails(offer, error) {
  const amountLine = offer.tradeType === 'direct'
    ? `${safeText(offer.weighedKg || '-', 10)}kg @ KES ${safeText(offer.agreedPricePerKg || '-', 12)}/kg`
    : `Sale KES ${safeText(offer.saleAmount || 'pending', 12)}; comm ${safeText(offer.commissionPercent, 8)}%`;
  return con([
    ...(error ? [safeText(error, 38)] : []),
    `Offer ${safeText(offer.reference, 28)}`,
    `${safeText(offer.status, 12)}; ${safeText(offer.tradeType, 12)}`,
    amountLine,
    `Details: ${offer.paymentDetailsConfirmedAt ? 'confirmed' : 'not confirmed'}`,
    '1 Confirm payout details',
    '0 Back',
  ]);
}

function offerPaymentPin(error) {
  return con([
    ...(error ? [safeText(error, 42)] : []),
    'Enter your 4-digit PIN to confirm payout details:',
    '0 Back',
  ]);
}

module.exports = {
  MAX_USSD_LENGTH,
  accountPin,
  accountSummary,
  con,
  consent,
  end,
  expectedPrice,
  harvestConfirmation,
  harvestWeight,
  mainMenu,
  marketPrice,
  mpesaNumber,
  numberedList,
  offerConfirmation,
  offerPaymentDetails,
  offerPaymentPin,
  offerSubmitted,
  offerWeight,
  optInName,
  pin,
  safeText,
  tradeType,
  truncateSafe,
};
