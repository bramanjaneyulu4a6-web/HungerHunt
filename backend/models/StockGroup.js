import mongoose from "mongoose";

const stockGroupSchema = new mongoose.Schema(
{
  name: {
    type: String,
    required: true,
    unique: true
  }
},
{ timestamps: true }
);

export default mongoose.model(
  "StockGroup",
  stockGroupSchema
);