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
  }
});

const purchaseSchema = new mongoose.Schema(
{
  items: [purchaseItemSchema],

  status: {
    type: String,
    enum: ["NEW", "COMPLETED"],
    default: "NEW"
  },

  completedAt: Date
},
{ timestamps: true }
);

export default mongoose.model("Purchase", purchaseSchema);