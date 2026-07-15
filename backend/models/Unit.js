import mongoose from "mongoose";

const unitSchema = new mongoose.Schema(
{
  name: {
    type: String,
    required: true,
    unique: true
  },

  symbol: {
    type: String,
    required: true
  }
},
{ timestamps: true }
);

export default mongoose.model(
  "Unit",
  unitSchema
);