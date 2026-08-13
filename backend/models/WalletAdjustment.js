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
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
      index: true,
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
  },
  { timestamps: true }
);

walletAdjustmentSchema.index({ studentId: 1, createdAt: -1 });
walletAdjustmentSchema.index(
  { performedBy: 1, idempotencyKey: 1 },
  { unique: true, name: 'one_wallet_adjustment_per_admin_request' }
);

export default mongoose.model('WalletAdjustment', walletAdjustmentSchema);
