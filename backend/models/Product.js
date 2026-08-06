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
  }
},
{ timestamps: true }
);

export default mongoose.model("Product", productSchema);