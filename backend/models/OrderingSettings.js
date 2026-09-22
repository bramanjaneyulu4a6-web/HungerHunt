import mongoose from 'mongoose';

// The school-wide rules on who may order, as one row keyed 'ordering'. Only a
// super admin writes it. An absent row means every rule is at its default, so
// a fresh database — or production before anyone has opened the panel — is
// already enforcing them.
const orderingSettingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'ordering' },

  // A student may only open a kiosk session once a parent linked to them has
  // activated their account (set a password in the parent app). On by default.
  requireActivatedParent: { type: Boolean, default: true },

  // A student may have one order a business week (Sunday midnight IST): a paid
  // package that is not cancelled, or an order still waiting on its approver.
  // On by default. See utils/weeklyOrderLimit.js.
  oneOrderPerWeek: { type: Boolean, default: true },

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
}, { timestamps: true });

export default mongoose.model('OrderingSettings', orderingSettingsSchema);
