import mongoose from 'mongoose';

// One row per physical delivery: who received it, against which supplier
// invoice, and what actually arrived line by line. The purchase order never
// changes; these rows are why a shortfall stays visible — the discrepancy is
// always ordered minus the sum of these.
const receiptLineSchema = new mongoose.Schema({
  _id: false,
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  // Usable units — these reach the shelf.
  received: { type: Number, default: 0 },
  // Arrived but unusable — counts against the order, never against stock.
  damaged: { type: Number, default: 0 },
  reason: { type: String, default: '' },
  // What this delivery was invoiced at, per unit. No default on purpose:
  // absent means nobody had the invoice in hand, which is not the same as a
  // price of zero. The order carries the latest figure; this is what each
  // delivery actually cost, which is the only place a price change between
  // two part-deliveries of one order stays visible.
  purchasePrice: { type: Number },
});

const goodsReceiptSchema = new mongoose.Schema(
  {
    purchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Purchase',
      required: true,
      index: true,
    },

    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },

    invoiceNumber: { type: String, default: '' },
    note: { type: String, default: '' },

    // Minted by the client per confirm attempt. The unique index below is what
    // makes a double-tap or a retried request book one delivery, not two.
    clientToken: { type: String, required: true },

    lines: [receiptLineSchema],
  },
  { timestamps: true }
);

goodsReceiptSchema.index({ purchaseId: 1, clientToken: 1 }, { unique: true });

export default mongoose.model('GoodsReceipt', goodsReceiptSchema);
