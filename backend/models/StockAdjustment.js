import mongoose from "mongoose";

// The mirror of GoodsReceipt for movements that have no delivery behind
// them: spoilage, breakage, stocktake corrections, opening stock. The
// Inventory number stays derivable — receipts in, sales out, these rows for
// everything else — and every movement names who and why. stockAfter is
// recorded because sales do not write rows here, so without it the ledger
// would not read coherently beside them.
const stockAdjustmentSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    // Signed and whole: positive found stock, negative lost it. Never zero.
    delta: {
      type: Number,
      required: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    adjustedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },

    // What the shelf read after this write landed.
    stockAfter: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("StockAdjustment", stockAdjustmentSchema);
