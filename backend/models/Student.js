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
 // select: false keeps the bcrypt hash out of every query that does not ask
 // for it by name — the admin roster, the parent dashboard's populated
 // children and getChildDetails all returned the whole document and carried it
 // along. The three places that genuinely compare it opt back in with
 // .select('+purchasePassword').
 purchasePassword: {
  type: String,
  default: null,
  select: false
},

walletControl: {
  enabled: {
    type: Boolean,
    default: false
  },

  limitAmount: {
    type: Number,
    default: 0
  },

  limitType: {
    type: String,
    enum: ["DAILY", "WEEKLY", "MONTHLY"],
    default: "WEEKLY"
  }
}
  // parentPassword: { type: String, default: null } // Stored directly here to bind parent to student record safely
}, { timestamps: true });

// Prevent duplicate entries for the exact same student setup
studentSchema.index({ name: 1, fatherName: 1, parentPhoneNumber: 1 }, { unique: true });

export default mongoose.model('Student', studentSchema);


