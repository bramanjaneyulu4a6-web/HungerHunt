import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  fatherName: { type: String, required: true },
  hostelNumber: { type: String, required: true },
  grade: { type: String, required: true },
  parentPhoneNumber: { type: String, required: true },
  pocketMoney: { type: Number, default: 0 },
  rechargeHistory: [
  {
    amount: Number,
    previousBalance: Number,
    newBalance: Number,
    date: { type: Date, default: Date.now },
  }
],
  isParentRegistered: { type: Boolean, default: false },
  purchasePassword: {
  type: String,
  default: null
}
  // parentPassword: { type: String, default: null } // Stored directly here to bind parent to student record safely
}, { timestamps: true });

// Prevent duplicate entries for the exact same student setup
studentSchema.index({ name: 1, fatherName: 1, parentPhoneNumber: 1 }, { unique: true });

export default mongoose.model('Student', studentSchema);