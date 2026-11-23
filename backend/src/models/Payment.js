const mongoose = require('mongoose');

const positiveInteger = {
  validator: (value) => Number.isSafeInteger(value) && value > 0,
  message: 'Value must be a positive integer',
};

const paymentSchema = new mongoose.Schema({
  offerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Offer',
    required: true,
    immutable: true,
  },
  farmerId: {
    type: Number,
    required: true,
    immutable: true,
    validate: positiveInteger,
  },
  amount: {
    type: Number,
    required: true,
    immutable: true,
    validate: positiveInteger,
  },
  method: {
    type: String,
    required: true,
    enum: ['daraja_b2c'],
    default: 'daraja_b2c',
    immutable: true,
  },
  reference: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    minlength: 1,
    maxlength: 80,
    unique: true,
    immutable: true,
  },
  purpose: {
    type: String,
    required: true,
    enum: ['direct_purchase', 'consignment'],
    immutable: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'submitted', 'succeeded', 'failed', 'timeout'],
    default: 'pending',
  },
  originatorConversationId: {
    type: String,
    trim: true,
    maxlength: 200,
    default: null,
  },
  conversationId: {
    type: String,
    trim: true,
    maxlength: 200,
    default: null,
  },
  transactionId: {
    type: String,
    trim: true,
    maxlength: 200,
    default: null,
  },
  resultCode: {
    type: Number,
    default: null,
  },
  resultDescription: {
    type: String,
    trim: true,
    maxlength: 500,
    default: null,
  },
  requestedAt: {
    type: Date,
    required: true,
    default: Date.now,
    immutable: true,
  },
  submittedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  failedAt: { type: Date, default: null },
}, {
  timestamps: true,
  toJSON: {
    transform(document, returned) {
      returned.id = returned._id.toString();
      returned.offerId = returned.offerId.toString();
      delete returned._id;
      delete returned.__v;
      return returned;
    },
  },
});

paymentSchema.index({ offerId: 1, purpose: 1 }, { unique: true });

module.exports = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
