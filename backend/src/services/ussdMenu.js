/**
 * Render the main menu
 */
function mainMenu() {
  return (
    'CON Welcome to NectarTrace\n' +
    '1. Log harvest\n' +
    '2. Check market price\n' +
    '3. My account\n' +
    '4. List honey for sale'
  );
}

/**
 * Prompt for harvest weight
 */
function askHarvestWeight() {
  return 'CON Enter weight (kg):';
}

/**
 * Prompt for listing quantity
 */
function askListingQuantity() {
  return 'CON Enter quantity (kg):';
}

/**
 * Prompt for listing price
 */
function askListingPrice(quantityKg) {
  return `CON Quantity: ${quantityKg}kg\nEnter price per kg (KES):`;
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
 * Listing confirmation
 */
function listingConfirmation(quantityKg, pricePerKg) {
  return (
    `END Listed ${quantityKg}kg at KES ${pricePerKg}/kg.\n` +
    'Buyers can now see your honey.'
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
  askListingQuantity,
  askListingPrice,
  marketPrice,
  accountSummary,
  harvestConfirmation,
  listingConfirmation,
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