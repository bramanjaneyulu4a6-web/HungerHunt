import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
}, { _id: false });

/* An append-only credit for selected lines of a paid package. The original
 * Transaction remains the immutable sale; this row records the opposite
 * movement while FulfillmentOrder becomes the basket still owed. */
const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true, index: true },
  fulfillmentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'FulfillmentOrder', required: true, index: true },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  amount: { type: Number, required: true, min: 0.01 },
  previousBalance: { type: Number, required: true },
  newBalance: { type: Number, required: true },
  reason: { type: String, required: true, maxlength: 200 },
  idempotencyKey: { type: String, required: true, maxlength: 100 },
  items: { type: [itemSchema], required: true },
  receiptNumber: { type: String, default: null, maxlength: 40 },
}, { timestamps: true });

schema.index(
  { performedBy: 1, idempotencyKey: 1 },
  { unique: true, name: 'one_item_refund_per_staff_request' }
);
schema.index(
  { receiptNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { receiptNumber: { $type: 'string' } },
    name: 'one_item_refund_per_receipt_number',
  }
);

export default mongoose.model('ItemRefund', schema);
