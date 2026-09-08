import mongoose from 'mongoose';

// Append-only audit record for money added outside a purchase. The student
// document remains the fast balance projection; this collection is the
// durable, queryable ledger and must reconcile to it.
const walletAdjustmentSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    // Who put the money in. ADMIN rows are the office topping up at the desk
    // and carry performedBy; PARENT_UPI rows are money that arrived through a
    // payment intent and carry paymentIntentId instead. One ledger, two
    // provenances — the Tally export keeps a single funding-clearing mapping.
    source: {
      type: String,
      enum: ['ADMIN', 'PARENT_UPI'],
      default: 'ADMIN',
      required: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: function () { return this.source !== 'PARENT_UPI'; },
      index: true,
    },
    paymentIntentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentIntent',
      required: function () { return this.source === 'PARENT_UPI'; },
      default: null,
    },
    type: {
      type: String,
      enum: ['TOP_UP'],
      default: 'TOP_UP',
      required: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    previousBalance: { type: Number, required: true },
    newBalance: { type: Number, required: true },
    idempotencyKey: { type: String, required: true, maxlength: 100 },
    // The quotable receipt number (GMS + ddmm + admission number + sequence),
    // minted lazily the first time any receipt for the student is opened —
    // utils/walletReceipts.js numbers a student's rows oldest first.
    receiptNumber: { type: String, default: null, maxlength: 40 },
  },
  { timestamps: true }
);

walletAdjustmentSchema.index({ studentId: 1, createdAt: -1 });
walletAdjustmentSchema.index(
  { performedBy: 1, idempotencyKey: 1 },
  { unique: true, name: 'one_wallet_adjustment_per_admin_request' }
);

// DB-level backstop for the settle claim: even if two processes both think
// they won, only one top-up row per intent can ever exist.
walletAdjustmentSchema.index(
  { paymentIntentId: 1 },
  {
    unique: true,
    partialFilterExpression: { paymentIntentId: { $type: 'objectId' } },
    name: 'one_wallet_adjustment_per_payment_intent',
  }
);

// Sparse-by-filter rather than sparse-by-flag: rows minted before the receipt
// feature carry null, and only real numbers must never repeat.
walletAdjustmentSchema.index(
  { receiptNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { receiptNumber: { $type: 'string' } },
    name: 'one_adjustment_per_receipt_number',
  }
);

export default mongoose.model('WalletAdjustment', walletAdjustmentSchema);
