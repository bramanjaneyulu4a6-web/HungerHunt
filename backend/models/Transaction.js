import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    quantity: Number,
    price: Number
  }],
  totalAmount: { type: Number, required: true },
  previousBalance: { type: Number, required: true },
  remainingBalance: { type: Number, required: true },
  sourceType: {
    type: String,
    enum: ['DIRECT_CHECKOUT', 'PARENT_APPROVAL', 'UPI_ORDER_PAYMENT'],
    default: 'DIRECT_CHECKOUT',
  },
  sourceId: { type: mongoose.Schema.Types.ObjectId },
  idempotencyKey: { type: String },
  // The school's numbered receipt, minted lazily by ensureReceiptNumbers.
  // Only UPI_ORDER_PAYMENT charges get one — that money entered the school's
  // books directly, like a top-up. Wallet-funded charges spend money that was
  // receipted when it entered the wallet, and stay unnumbered.
  receiptNumber: { type: String, default: null, maxlength: 40 },
}, { timestamps: true });

transactionSchema.index({ studentId: 1, createdAt: -1 });
transactionSchema.index({ createdAt: -1 });
transactionSchema.index(
  { sourceType: 1, sourceId: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceType: 'PARENT_APPROVAL' },
    name: 'one_transaction_per_parent_approval',
  }
);
// Mirror of one_transaction_per_parent_approval for the externally funded
// path: one charge per pending order, however many times a webhook replays.
transactionSchema.index(
  { sourceType: 1, sourceId: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceType: 'UPI_ORDER_PAYMENT' },
    name: 'one_transaction_per_upi_payment',
  }
);

// One number, one payment — same guarantee WalletAdjustment gives its rows.
transactionSchema.index(
  { receiptNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { receiptNumber: { $type: 'string' } },
  }
);

export default mongoose.model('Transaction', transactionSchema);
