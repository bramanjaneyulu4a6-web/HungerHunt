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
}, { timestamps: true });

schema.index({ performedBy: 1, idempotencyKey: 1 }, { unique: true, name: 'one_wallet_reversal_per_staff_request' });
schema.index({ studentId: 1, createdAt: -1 });

export default mongoose.model('WalletReversal', schema);

