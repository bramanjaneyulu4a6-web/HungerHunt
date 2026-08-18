import mongoose from "mongoose";
import { DEFAULT_SUBCATEGORY, SUBCATEGORY_MAX_LENGTH } from '../utils/productSubcategory.js';

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
  }
},
{ timestamps: true }
);

export default mongoose.model(
  "StockGroup",
  stockGroupSchema
);
