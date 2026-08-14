import mongoose from "mongoose";
import { DEFAULT_SUBCATEGORY, SUBCATEGORY_MAX_LENGTH } from '../utils/productSubcategory.js';

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

  // A shelf within the broad stock group shown on the kiosk. It stays a
  // product field (rather than another global catalogue) because the same
  // word can be useful under several groups and products move independently.
  // Legacy rows resolve to Others until the backfill or an admin edit assigns
  // something more specific.
  subCategory: {
    type: String,
    trim: true,
    maxlength: SUBCATEGORY_MAX_LENGTH,
    default: DEFAULT_SUBCATEGORY,
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
  },

  // How much of this one product a single student may buy in a period —
  // the rule that stops one child spending a whole week's allowance on
  // chocolate. Distinct from walletControl, which caps rupees across the
  // whole basket; this caps units of one line. Both are checked, and either
  // can refuse a sale on its own.
  //
  // `enabled` is the on switch rather than "quantity 0 means unlimited", so
  // that turning a limit off keeps the number the office last chose instead
  // of making them type it again. Rows written before this field have no
  // purchaseLimit at all, which reads as disabled through the defaults.
  //
  // The controller refuses an enabled limit of 0 — a product nobody may buy
  // is an archived product, and letting a blank quantity mean that would
  // take a product off sale without anyone saying so.
  purchaseLimit: {
    enabled: {
      type: Boolean,
      default: false
    },

    quantity: {
      type: Number,
      min: 0,
      default: 0
    },

    // TOTAL means "ever" — no period start, counted over the student's whole
    // history. The other three resolve through businessPeriodStart, so they
    // turn over at midnight in the configured business zone, not the
    // server's.
    period: {
      type: String,
      enum: ["DAILY", "WEEKLY", "MONTHLY", "TOTAL"],
      default: "DAILY"
    }
  }
},
{ timestamps: true }
);

productSchema.index({ active: 1, name: 1 });
productSchema.index({ stockGroup: 1, subCategory: 1, active: 1, name: 1 });

export default mongoose.model("Product", productSchema);
