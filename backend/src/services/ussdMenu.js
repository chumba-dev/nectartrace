/**
 * Render the main menu
 */
function mainMenu() {
  return (
    'CON Welcome to NectarTrace\n' +
    '1. Log harvest\n' +
    '2. Check market price\n' +
    '3. My account\n' +
    '4. Offer harvest to cooperative'
  );
}

/**
 * Prompt for harvest weight
 */
function askHarvestWeight() {
  return 'CON Enter weight (kg):';
}

/**
 * Show cooperative choices
 */
function askPickupVillage() {
  return 'CON Enter your village or pickup area:';
}

function cooperativeSelection(cooperatives, pickupVillage) {
  const choices = cooperatives
    .map((cooperative, index) => `${index + 1}. ${cooperative.name} (${cooperative.village})`)
    .join('\n');
  return `CON Cooperatives near ${pickupVillage}:\n${choices}`;
}

/**
 * Prompt for an offer's weight and expected price
 */
function askOfferWeight(cooperativeName) {
  return `CON ${cooperativeName}\nEnter offered weight (kg):`;
}

function askExpectedPrice(weightKg) {
  return `CON Offered: ${weightKg}kg\nEnter expected KES/kg (or 0 to skip):`;
}

function askSettlementType() {
  return (
    'CON Select settlement type:\n' +
    '1. Direct cooperative purchase\n' +
    '2. Consignment'
  );
}

/**
 * Show market price
 */
function marketPrice(gradeA, gradeB) {
  return (
    'END Current Nairobi honey price:\n' +
    `Grade A: KES ${gradeA}/kg\n` +
    `Grade B: KES ${gradeB}/kg\n` +
    'Last updated: today'
  );
}

/**
 * Show account summary
 */
function accountSummary(user, totalWeightKg, estimatedEarnings, cooperativeName) {
  return (
    `END Name: ${user.name}\n` +
    `Total this month: ${totalWeightKg}kg\n` +
    `Est. earnings: KES ${estimatedEarnings.toLocaleString()}\n` +
    `Cooperative: ${cooperativeName || 'Not assigned'}`
  );
}

/**
 * Harvest confirmation
 */
function harvestConfirmation(weightKg, totalThisMonth) {
  return (
    `END Harvest of ${weightKg}kg recorded.\n` +
    `You have logged ${totalThisMonth}kg this month.\n` +
    'Confirmation sent via SMS.'
  );
}

/**
 * Harvest-offer confirmation
 */
function offerConfirmation(reference, cooperativeName) {
  return (
    `END Offer ${reference} submitted to ${cooperativeName}.\n` +
    'Confirmation sent via SMS.'
  );
}

/**
 * Generic error
 */
function errorMessage(message = 'An error occurred. Please try again.') {
  return `END ${message}`;
}

module.exports = {
  mainMenu,
  askHarvestWeight,
  askPickupVillage,
  cooperativeSelection,
  askOfferWeight,
  askExpectedPrice,
  askSettlementType,
  marketPrice,
  accountSummary,
  harvestConfirmation,
  offerConfirmation,
  errorMessage,
  phoneNotRegistered,
  invalidInput,
  serviceUnavailable,
};

//Error Handling & Edge Cases
function phoneNotRegistered() {
  return 'END Your number is not registered.\nContact your cooperative to register.';
}

function invalidInput() {
  return 'END Invalid input. Please try again.';
}

function serviceUnavailable() {
  return 'END Service unavailable. Please try later.';
}
