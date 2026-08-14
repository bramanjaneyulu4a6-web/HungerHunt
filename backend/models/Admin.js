import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const adminSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  phone: { type: String, required: true, trim: true, maxlength: 30 },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  // What this account may reach. 'warehouse' receives deliveries and raises
  // purchase orders — no students, no wallets, no prices. Everything else —
  // the catalogue, top-ups, student records, billing, other accounts — is
  // 'admin', which reaches all of it.
  //
  // There was a 'cashier' here for the till. Removed with the counter it
  // belonged to: students ring themselves up at the kiosk now. Any row still
  // carrying it fails the role check on its next request, which is correct —
  // the account should be deleted or made an admin.
  role: {
    type: String,
    enum: ['admin', 'warehouse', 'caretaker'],
    default: 'admin',
  },

  hostelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hostel',
    default: null,
    validate: {
      validator(value) {
        return this.role === 'caretaker' ? Boolean(value) : value == null;
      },
      message: 'A hostel is required for caretaker accounts and is not allowed for other roles.',
    },
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
