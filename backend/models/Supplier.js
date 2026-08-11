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
  },
  { timestamps: true }
);

export default mongoose.model('Supplier', supplierSchema);
