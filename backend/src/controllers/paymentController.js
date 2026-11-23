const paymentService = require('../services/paymentService');
const offerService = require('../services/offerService');

function handlePaymentError(err, res, next) {
  if (err instanceof paymentService.PaymentServiceError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      code: err.code,
      ...(err.payment && { data: { payment: err.payment } }),
    });
  }
  if (err instanceof offerService.OfferServiceError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      code: err.code,
    });
  }
  if (err?.name === 'ValidationError' || err?.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid payment data' });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ success: false, message: 'Payment already exists' });
  }
  return next(err);
}

async function initiateOfferPayout(req, res, next) {
  try {
    const result = await paymentService.initiatePayout({
      offerIdentifier: req.params.offerId,
      user: req.user,
      reference: req.body?.reference,
    });
    return res.status(result.created ? 201 : 200).json({
      success: true,
      message: result.idempotent ? 'Existing payout returned' : 'Payout submitted',
      data: {
        payment: result.payment,
        ...(result.amounts && { amounts: result.amounts }),
      },
    });
  } catch (err) {
    return handlePaymentError(err, res, next);
  }
}

async function confirmOfferPaymentDetails(req, res, next) {
  try {
    const confirmation = await paymentService.confirmPaymentDetails({
      offerIdentifier: req.params.offerId,
      farmerId: req.user.id,
      pin: req.body?.pin,
    });
    return res.json({
      success: true,
      message: 'Payout details confirmed',
      data: confirmation,
    });
  } catch (err) {
    return handlePaymentError(err, res, next);
  }
}

async function getOfferPayment(req, res, next) {
  try {
    const payment = await paymentService.getOfferPayment({
      offerIdentifier: req.params.offerId,
      user: req.user,
    });
    return res.json({ success: true, data: payment });
  } catch (err) {
    return handlePaymentError(err, res, next);
  }
}

async function darajaResult(req, res, next) {
  try {
    await paymentService.processDarajaCallback({
      payload: req.body,
      type: 'result',
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

async function darajaTimeout(req, res, next) {
  try {
    await paymentService.processDarajaCallback({
      payload: req.body,
      type: 'timeout',
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  confirmOfferPaymentDetails,
  darajaResult,
  darajaTimeout,
  getOfferPayment,
  handlePaymentError,
  initiateOfferPayout,
};
