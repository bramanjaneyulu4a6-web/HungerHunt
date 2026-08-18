import mongoose from 'mongoose';

const hostelSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: { type: String, trim: true, default: '' },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export const normalizeHostelCode = (value) => String(value ?? '').trim().toUpperCase();

export default mongoose.model('Hostel', hostelSchema);
