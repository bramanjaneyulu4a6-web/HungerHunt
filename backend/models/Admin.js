import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const adminSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  phone: { type: String, required: true, unique: true, trim: true, maxlength: 30 },
  email: {
    type: String,
    required() { return (this.role || 'admin') === 'admin'; },
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true,
    set: (value) => String(value ?? '').trim().toLowerCase() || undefined,
  },
  password: { type: String, required: true },
  active: { type: Boolean, default: true, index: true },

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

  // The super admin: an admin who also owns the staff roster — sees every
  // account, creates and archives them, and hands this flag on. A flag rather
  // than a fourth role so every gate that admits 'admin' keeps admitting this
  // account unchanged; only the roster asks the extra question. Legal on the
  // admin role alone. Stored false explicitly on new rows so nothing has to
  // ask about a missing field the way FULL_ADMIN must for role.
  isSuperAdmin: {
    type: Boolean,
    default: false,
    validate: {
      validator(value) {
        return !value || (this.role || 'admin') === 'admin';
      },
      message: 'Only an admin account can be a super admin.',
    },
  },

  roomIds: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Room' }],
    default: [],
    validate: {
      validator(value) {
        const count = Array.isArray(value) ? value.length : 0;
        return this.role === 'caretaker' ? count > 0 : count === 0;
      },
      message: 'At least one room is required for caretaker accounts and rooms are not allowed for other roles.',
    },
  },

  // Per-account exceptions to the role's feature visibility: a list of
  // { key, value } with value 'hidden' or 'shown'. A list rather than a Map
  // because Mongo map keys may not contain dots and most feature keys do
  // ('students.purchaseCode'). Absent keys follow the role. Written only
  // through the super admin's panel (featureController), never by updateStaff.
  featureOverrides: {
    type: [{
      _id: false,
      key: { type: String, required: true },
      value: { type: String, enum: ['hidden', 'shown'], required: true },
    }],
    default: undefined,
  },

  resetPasswordToken: String,
  resetPasswordExpire: Date,
}, { timestamps: true });

adminSchema.pre('save', async function () {
  if (!this.isModified('password')) return;

  if (!this.password) {
    throw new Error("Password is required");
  }

  this.password = await bcrypt.hash(this.password, 10);
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

// The one row shape the roster's gate accepts. Always spelled with the flag
// set, never `$ne: false`, so a row from before the flag existed is a plain
// admin rather than a super admin by omission.
export const SUPER_ADMIN = { ...FULL_ADMIN, isSuperAdmin: true };

export default mongoose.model('Admin', adminSchema);
