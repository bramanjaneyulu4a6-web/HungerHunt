import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
{
  name: {
    type: String,
    required: true,
    unique: true
  },

  stockGroup: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "StockGroup",
    required: true
  },

  unit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Unit",
    required: true
  },

  price: {
    type: Number,
    default: 0
  },

  image: {
    type: String,
    default: ""
  },

  // Money remembers products: orders, receipts and transactions reference
  // these rows forever, which is why there is no delete anywhere — the same
  // rule suppliers follow. Rows from before the field have no `active`;
  // absent means active, and every filter spells that out as
  // { active: { $ne: false } } because Mongo will not infer it.
  active: {
    type: Boolean,
    default: true
  },

  // The stock level below which the office should reorder. 5 was the
  // Inventory badge's hardcoded threshold before this field existed, so 5 is
  // the default that changes nothing. 0 means "never flag". Legacy rows read
  // as 5 through this default on hydration — the reads that use it are not
  // .lean().
  reorderLevel: {
    type: Number,
    default: 5
  },

  // Analytics suggests adjustments to this buffer but never writes it
  // without an explicit administrative command.
  safetyStock: {
    type: Number,
    min: 0,
    default: 0
  }
},
{ timestamps: true }
);

productSchema.index({ active: 1, name: 1 });

export default mongoose.model("Product", productSchema);
