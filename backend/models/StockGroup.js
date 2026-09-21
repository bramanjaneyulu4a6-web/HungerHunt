import mongoose from "mongoose";
import { DEFAULT_SUBCATEGORY, SUBCATEGORY_MAX_LENGTH } from '../utils/productSubcategory.js';

export const LIMIT_PERIODS = ["DAILY", "WEEKLY", "MONTHLY", "TOTAL"];

const limitSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  quantity: { type: Number, min: 0, default: 0 },
  period: { type: String, enum: LIMIT_PERIODS, default: "WEEKLY" },
}, { _id: false });

const stockGroupSchema = new mongoose.Schema(
{
  name: {
    type: String,
    required: true,
    unique: true
  },
  order: {
    type: Number,
    min: 0,
    default: 0
  },
  subCategories: {
    type: [{
      type: String,
      trim: true,
      maxlength: SUBCATEGORY_MAX_LENGTH,
    }],
    default: [DEFAULT_SUBCATEGORY]
  },

  // Off means none of this category's products can be bought: the kiosk
  // drops the category, the till stops offering it, and every checkout and
  // approval refuses its lines. Stock, history and the products themselves
  // are untouched, so switching it back on restores exactly what was there.
  active: {
    type: Boolean,
    default: true
  },

  // A per-student cap on the whole category: units of all its products
  // together, per period. Same shape and rules as Product.purchaseLimit, and
  // it only ever tightens — see utils/purchaseLimits.js.
  purchaseLimit: {
    type: limitSchema,
    default: () => ({})
  },

  // The same cap per sub-category, by name. Kept in step with subCategories
  // by the routes: a rename carries its cap, a removal drops it.
  subCategoryLimits: {
    type: [new mongoose.Schema({
      name: { type: String, trim: true, required: true, maxlength: SUBCATEGORY_MAX_LENGTH },
      enabled: { type: Boolean, default: false },
      quantity: { type: Number, min: 0, default: 0 },
      period: { type: String, enum: LIMIT_PERIODS, default: "WEEKLY" },
    }, { _id: false })],
    default: []
  }
},
{ timestamps: true }
);

export default mongoose.model(
  "StockGroup",
  stockGroupSchema
);
