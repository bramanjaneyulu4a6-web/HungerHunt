import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  // What this account may reach. 'cashier' is the till: find a student, take a
  // payment, raise an approval request, and nothing else. Everything that
  // changes the shop or the money supply — the catalogue, top-ups, student
  // records, other accounts — stays with 'admin'.
  role: {
    type: String,
    enum: ['admin', 'cashier'],
    default: 'admin',
  },

  resetPasswordToken: String,
  resetPasswordExpire: Date,
}, { timestamps: true });

adminSchema.pre('save', async function () {
  try {
    if (!this.isModified('password')) return;

    if (!this.password) {
      throw new Error("Password is required");
    }

    this.password = await bcrypt.hash(this.password, 10);
  } catch (err) {
    throw err;
  }
});

// Every account created before cashiers existed has no role field at all, and
// each one of them is a full admin. Asking for role:'admin' alone would lock
// out every existing deployment on the first request after this deploys, so the
// missing field has to be spelled out as part of the question wherever it is
// asked — which is why this is a shared constant rather than a filter written
// twice.
export const FULL_ADMIN = {
  $or: [{ role: 'admin' }, { role: { $exists: false } }],
};

export default mongoose.model('Admin', adminSchema);