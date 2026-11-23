const mongoose = require('mongoose');

const OFFER_LIFETIME_MS = 48 * 60 * 60 * 1000;
const OFFER_STATUSES = [
  'offered',
  'accepted',
  'rejected',
  'expired',
  'delivered',
  'verified',
  'paid',
];

function finiteNumberInRange({ min, max, exclusiveMin = false, exclusiveMax = false }) {
  return {
    validator(value) {
      if (value === null || value === undefined) return true;
      if (!Number.isFinite(value)) return false;
      if (min !== undefined && (exclusiveMin ? value <= min : value < min)) return false;
      if (max !== undefined && (exclusiveMax ? value >= max : value > max)) return false;
      return true;
    },
    message: 'Value is outside the allowed range',
  };
}

const positiveInteger = {
  validator: (value) => Number.isSafeInteger(value) && value > 0,
  message: 'Value must be a positive integer',
};

const offerSchema = new mongoose.Schema({
  farmerId: {
    type: Number,
    required: true,
    immutable: true,
    validate: positiveInteger,
  },
  cooperativeId: {
    type: Number,
    required: true,
    immutable: true,
    validate: positiveInteger,
  },
  ward: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 120,
  },
  offeredKg: {
    type: Number,
    required: true,
    immutable: true,
    validate: finiteNumberInRange({ min: 0, max: 10000, exclusiveMin: true }),
  },
  expectedPricePerKg: {
    type: Number,
    required: true,
    default: 0,
    immutable: true,
    validate: finiteNumberInRange({ min: 0 }),
  },
  tradeType: {
    type: String,
    required: true,
    enum: ['direct', 'consignment'],
    immutable: true,
  },
  commissionPercent: {
    type: Number,
    required: true,
    immutable: true,
    validate: finiteNumberInRange({ min: 0, max: 100 }),
  },
  agreedPricePerKg: {
    type: Number,
    default: null,
    validate: finiteNumberInRange({ min: 0 }),
  },
  weighedKg: {
    type: Number,
    default: null,
    validate: finiteNumberInRange({ min: 0, max: 10000, exclusiveMin: true }),
  },
  moisturePercent: {
    type: Number,
    default: null,
    validate: finiteNumberInRange({ min: 0, max: 100, exclusiveMin: true, exclusiveMax: true }),
  },
  status: {
    type: String,
    required: true,
    enum: OFFER_STATUSES,
    default: 'offered',
  },
  offeredAt: {
    type: Date,
    required: true,
    default: Date.now,
    immutable: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    immutable: true,
    default() {
      const start = this.offeredAt instanceof Date ? this.offeredAt.getTime() : Date.now();
      return new Date(start + OFFER_LIFETIME_MS);
    },
  },
  ussdSessionId: {
    type: String,
    trim: true,
    maxlength: 200,
    unique: true,
    sparse: true,
    select: false,
    immutable: true,
  },
  reference: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    maxlength: 80,
    unique: true,
    immutable: true,
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: 500,
    default: null,
  },
  batchId: {
    type: String,
    trim: true,
    maxlength: 120,
    match: /^BAR-\d{4}-\d{3}$/,
    default: null,
  },
  batchReservationToken: {
    type: String,
    default: null,
    select: false,
    match: /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i,
  },
  saleAmount: {
    type: Number,
    default: null,
    validate: finiteNumberInRange({ min: 0 }),
  },
  paymentDetailsConfirmedAt: { type: Date, default: null },
  acceptedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },
  expiredAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  verifiedAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
}, {
  timestamps: true,
  toJSON: {
    transform(document, returned) {
      returned.id = returned._id.toString();
      delete returned._id;
      delete returned.__v;
      delete returned.ussdSessionId;
      delete returned.batchReservationToken;
      return returned;
    },
  },
});

offerSchema.index({ cooperativeId: 1, status: 1, expiresAt: 1 });
offerSchema.index({ cooperativeId: 1, status: 1, batchId: 1 });
offerSchema.index({ farmerId: 1, createdAt: -1 });

offerSchema.statics.STATUSES = OFFER_STATUSES;
offerSchema.statics.OFFER_LIFETIME_MS = OFFER_LIFETIME_MS;

module.exports = mongoose.models.Offer || mongoose.model('Offer', offerSchema);
