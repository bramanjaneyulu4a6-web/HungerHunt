import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  currentStock: { type: Number, required: true },
  openOrderQuantity: { type: Number, required: true, default: 0 },
  suggestedQuantity: { type: Number, required: true, min: 1 },
  estimatedUnitCost: { type: Number, default: null, min: 0 },
}, { _id: false });

const schema = new mongoose.Schema({
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  analyticsDate: { type: String, required: true },
  analyticsAsOf: { type: Date, required: true },
  analyticsSchemaVersion: { type: String, required: true },
  status: {
    type: String,
    enum: ['ACTIVE', 'SUBMITTING', 'SUBMITTED', 'EXPIRED'],
    default: 'ACTIVE',
  },
  items: { type: [itemSchema], required: true },
  expiresAt: { type: Date, required: true },
  submittedAt: Date,
  submittedPurchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
}, { timestamps: true });

schema.index(
  { createdBy: 1, analyticsDate: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['ACTIVE', 'SUBMITTING'] } },
    name: 'one_active_replenishment_draft',
  }
);
schema.index({ status: 1, expiresAt: 1 });

export default mongoose.model('ReplenishmentDraft', schema);
