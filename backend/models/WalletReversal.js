import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1 },
}, { _id: false });

const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true, unique: true },
  fulfillmentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'FulfillmentOrder', required: true, unique: true },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  type: { type: String, enum: ['ORDER_CANCELLATION'], default: 'ORDER_CANCELLATION' },
  amount: { type: Number, required: true, min: 0 },
  previousBalance: { type: Number, required: true },
  newBalance: { type: Number, required: true },
  reason: { type: String, required: true, maxlength: 200 },
  idempotencyKey: { type: String, required: true, maxlength: 100 },
  restoredItems: { type: [itemSchema], required: true },
  // The quotable number for the money going back, drawn from the same
  // per-student series as a top-up's receipt so the office has one sequence to
  // search rather than two — see utils/walletReceipts.js.
  receiptNumber: { type: String, default: null, maxlength: 40 },
}, { timestamps: true });

schema.index({ performedBy: 1, idempotencyKey: 1 }, { unique: true, name: 'one_wallet_reversal_per_staff_request' });
schema.index({ studentId: 1, createdAt: -1 });
// Sparse-by-filter, like the adjustment ledger's: reversals written before
// this carry null, and only real numbers must never repeat.
schema.index(
  { receiptNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { receiptNumber: { $type: 'string' } },
    name: 'one_reversal_per_receipt_number',
  }
);

export default mongoose.model('WalletReversal', schema);

