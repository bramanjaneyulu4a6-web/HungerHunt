import mongoose from 'mongoose';

/* One row per attempt to bring outside money in — including the attempts that
 * failed, which no other ledger has a place for. The webhook, the app's
 * status poll and the reconcile script all converge on this row; its status
 * field is the lock that makes them credit exactly once.
 *
 * Lifecycle: CREATED -> PENDING -> APPLYING -> APPLIED
 * and from PENDING out to FAILED / EXPIRED / AMOUNT_MISMATCH.
 * APPLYING is a claim, same idea as PendingOrder's PROCESSING: taken with an
 * atomic findOneAndUpdate, released back to PENDING if the apply fails. */
const paymentIntentSchema = new mongoose.Schema(
  {
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },

    purpose: { type: String, enum: ['ORDER', 'TOPUP'], required: true },

    pendingOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PendingOrder',
      // What an ORDER payment is for; a TOPUP has no order.
      required: function () { return this.purpose === 'ORDER'; },
      default: null,
    },

    // Integer paise, the unit PhonePe transacts in. Never rupees.
    amountPaise: {
      type: Number,
      required: true,
      validate: {
        validator: (v) => Number.isInteger(v) && v > 0,
        message: 'amountPaise must be a positive integer',
      },
    },

    // Ours; what PhonePe echoes back in webhooks and status reads.
    merchantOrderId: { type: String, required: true, maxlength: 63 },

    provider: { type: String, enum: ['PHONEPE'], default: 'PHONEPE', required: true },
    providerOrderId: { type: String, default: null },

    status: {
      type: String,
      enum: ['CREATED', 'PENDING', 'APPLYING', 'APPLIED', 'FAILED', 'EXPIRED', 'AMOUNT_MISMATCH'],
      default: 'CREATED',
      index: true,
    },

    // Set when a captured ORDER payment could not buy its order (stock gone,
    // order expired or edited) and the money landed as wallet balance instead.
    degradedToTopup: { type: Boolean, default: false },

    // Exactly one of these once APPLIED: the purchase it funded, or the
    // top-up row it became (also the degraded case).
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
    walletAdjustmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletAdjustment', default: null },

    // What PhonePe last said, verbatim, for the audit trail.
    providerState: { type: String, default: null },
    providerAmountPaise: { type: Number, default: null },
    failureReason: { type: String, maxlength: 500, default: null },

    appliedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

paymentIntentSchema.index({ merchantOrderId: 1 }, { unique: true });
paymentIntentSchema.index({ parentId: 1, createdAt: -1 });
// The reconcile script's read: unfinished intents, oldest first.
paymentIntentSchema.index({ status: 1, updatedAt: 1 });

export default mongoose.model('PaymentIntent', paymentIntentSchema);
