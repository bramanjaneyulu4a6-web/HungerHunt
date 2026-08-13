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
    enum: ['DIRECT_CHECKOUT', 'PARENT_APPROVAL'],
    default: 'DIRECT_CHECKOUT',
  },
  sourceId: { type: mongoose.Schema.Types.ObjectId },
  idempotencyKey: { type: String },
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

export default mongoose.model('Transaction', transactionSchema);
