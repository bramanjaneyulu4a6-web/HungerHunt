import mongoose from 'mongoose';

// A supplier is a name the money remembers. Purchase orders reference these
// rows forever, which is why there is no delete anywhere — a supplier the
// school stops using is deactivated, and its history stays attached.
const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    phone: { type: String, trim: true },
    contactPerson: { type: String, trim: true },
    notes: { type: String },
    active: { type: Boolean, default: true },
    // Used by deterministic reorder calculations. Historical rows without a
    // value use the analytics service's documented seven-day fallback.
    leadTimeDays: { type: Number, min: 0, default: 7 },
  },
  { timestamps: true }
);

supplierSchema.index({ active: 1, name: 1 });

export default mongoose.model('Supplier', supplierSchema);
