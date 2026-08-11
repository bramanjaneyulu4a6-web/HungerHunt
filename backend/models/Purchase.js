import mongoose from "mongoose";

const purchaseItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },

  quantity: {
    type: Number,
    required: true
  },

  purchasePrice: {
    type: Number,
    default: 0
  },

  // Units covered by goods receipts so far — received plus damaged, because a
  // damaged unit arrived and counts against the order even though it never
  // reaches the shelf. `quantity` above is what was ordered and is never
  // edited after creation; this is the only field receipts move.
  received: {
    type: Number,
    default: 0
  }
});

const purchaseSchema = new mongoose.Schema(
{
  items: [purchaseItemSchema],

  status: {
    type: String,
    enum: ["NEW", "PARTIAL", "COMPLETED", "CANCELLED"],
    default: "NEW"
  },

  // Optional on both ends: rows from before suppliers existed have neither,
  // and both are provenance, not behaviour.
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Supplier"
  },

  raisedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin"
  },

  completedAt: Date,

  // A cancel is a statement about the order's future, not its past: receipts,
  // stock and received counts already booked all stand, and the remainder is
  // simply never coming. Admin-only — the storeroom's honest exit for an
  // abandoned order is closing it short at what actually arrived.
  cancelledAt: Date,

  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin"
  }
},
{ timestamps: true }
);

export default mongoose.model("Purchase", purchaseSchema);