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

  // What the packet says the thing costs, before the school takes anything
  // off. This is the figure the office types; `price` below is arithmetic.
  //
  // Required for the same reason price is: without it a discount has nothing
  // to compute against. Rows written before this field have no mrp at all,
  // which is why the backfill sets it to the price they were already selling
  // at — see scripts/backfillProductMrp.js.
  mrp: {
    type: Number,
    required: true,
    validate: {
      validator: (v) => v > 0,
      message: 'A product must have an MRP above zero.'
    }
  },

  // Percent off the MRP. Below 100, not up to it: a rate of 100 prices the
  // product at nothing, and the till reads nothing as free and hands the goods
  // over. A giveaway is a different decision, made elsewhere.
  discountRate: {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: (v) => v < 100,
      message: 'A discount must be below 100%.'
    }
  },

  // Required, and never zero. A default of 0 used to stand in for "not priced
  // yet", but the till reads that as free and hands the goods over, so an
  // unpriced product must not be creatable rather than creatable and dangerous.
  // Guarded here as well as in the controller because seeds and scripts write
  // straight through the model.
  //
  // Derived, never typed: the controller computes it from mrp and discountRate
  // through utils/pricing.js and refuses a caller that tries to set it
  // directly. Everything downstream — the till, pending orders, receipts —
  // reads this one field and needs to know nothing about the discount.
  price: {
    type: Number,
    required: true,
    validate: {
      validator: (v) => v > 0,
      message: 'A product must have a price above zero.'
    }
  },

  // What is in the packet, counted in the product's own unit: 250 on a bottle
  // whose unit is ml, 150 on a wrapper whose unit is g. The number alone means
  // nothing — it is only ever shown beside that unit.
  //
  // Optional, and carrying no default, because the catalogue predates the
  // field and a product without a size still sells. Absent has to stay
  // distinguishable from a typed figure for the same reason the nutrition
  // macros do: the kiosk prints an absent size as no line at all, and a zero
  // would claim the packet is empty.
  packSize: {
    type: Number,
    validate: {
      validator: (v) => v === null || v > 0,
      message: 'A pack size must be above zero, or left blank.'
    }
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

  // Whether students can see this on the kiosk. Distinct from `active`, and
  // deliberately so: archiving withdraws a product from sale everywhere and
  // files it away, while disabling only takes it off the students' screen —
  // staff can still ring it up at the admin till, and it stays in the admin's
  // own catalogue views wearing an overlay.
  //
  // Same convention as `active`: rows written before the field have no flag,
  // absent means visible, and every filter spells that out as
  // { kioskVisible: { $ne: false } } because Mongo will not infer it.
  kioskVisible: {
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

  // Copied off the packet by hand, so it arrives a field at a time and often
  // never completes. Every field is independently optional and none carries a
  // default: an absent macro must stay distinguishable from a typed 0, because
  // the till prints the first as a dash and the second as "0 g", and a
  // sugar-free drink claiming no data is a different statement from one
  // claiming no sugar.
  //
  // Nothing here is derived. The till shows these numbers and only these
  // numbers — no per-macro energy share, no totals checked against calories —
  // because the office transcribes what the wrapper says and a computed figure
  // sitting beside a transcribed one would look equally authoritative while
  // resting on an assumption nobody made.
  nutrition: {
    calories: {
      type: Number,
      min: 0
    },

    protein: {
      type: Number,
      min: 0
    },

    carbs: {
      type: Number,
      min: 0
    },

    fat: {
      type: Number,
      min: 0
    },

    // What the figures are per — "Per 52g pack", "Per 100g". Free text
    // because packets state it in whatever terms they please. The till falls
    // back to "Per unit as sold" when it is blank.
    serving: {
      type: String,
      trim: true,
      maxlength: 120
    }
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
