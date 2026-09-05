import mongoose from 'mongoose';
import {
  ADMISSION_NUMBER_MAX_LENGTH,
  ADMISSION_NUMBER_MESSAGE,
  ADMISSION_NUMBER_MIN_LENGTH,
  ADMISSION_NUMBER_PATTERN,
  normalizeAdmissionNumber,
} from '../utils/admissionNumber.js';

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  fatherName: { type: String, required: true },
  roomNumber: { type: String, required: true },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true,
  },
  grade: { type: String, required: true },
  parentPhoneNumber: { type: String, required: true },

  // Student records are referenced by financial ledgers and approvals, so
  // removal is an archive transition. Legacy rows without this field remain
  // active until explicitly archived.
  active: { type: Boolean, default: true, index: true },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },

  // The school's own ID for the student, imported from its roll. It is what a
  // student types to open a kiosk session, so it is required and unique.
  // It is canonicalized to uppercase so sign-in and uniqueness do not depend
  // on how somebody capitalizes the letters.
  admissionNumber: {
    type: String,
    required: [true, 'Admission number is required.'],
    unique: true,
    // Keep the existing index shape during rollout. Required blocks new
    // omissions, while sparse lets legacy rows be repaired by the migration
    // without an index-options conflict at application startup.
    sparse: true,
    trim: true,
    uppercase: true,
    minlength: [ADMISSION_NUMBER_MIN_LENGTH, ADMISSION_NUMBER_MESSAGE],
    maxlength: [ADMISSION_NUMBER_MAX_LENGTH, ADMISSION_NUMBER_MESSAGE],
    match: [ADMISSION_NUMBER_PATTERN, ADMISSION_NUMBER_MESSAGE],
    set: normalizeAdmissionNumber,
  },

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

/* Whether purchasePassword is known to be a four-digit code.
 *
 * It cannot be asked of the hash, so it is recorded instead: set whenever a
 * parent saves a code, which is validated, and set at the counter the first
 * time a four-digit code is accepted. Everything predating the rule starts
 * false and means "not known to be" rather than "known not to be" — a student
 * whose code always was four digits flips the first time they buy anything.
 *
 * The counter reads it to decide whether to show a number pad or a field that
 * will accept whatever the old code was. scripts/purchaseCodeAudit.js reports
 * how many are left; when that reaches zero the lenient path can go. */
purchaseCodeIsPin: {
  type: Boolean,
  default: false
},

/* Five consecutive wrong codes at checkout lock this student's checkout for
 * 15 minutes on every kiosk at once. The count and the deadline live on the
 * row rather than in memory so the lock holds across terminals and restarts.
 * A correct code resets the count. */
purchaseCodeAttempts: {
  type: Number,
  default: 0
},

purchaseCodeLockedUntil: {
  type: Date,
  default: null
},

// When on, the till cannot charge this student at the counter. The purchase
// password still has to be entered — that is what proves the order is theirs —
// but it only raises a request, and the parent approving it in the app is what
// spends the money. Off by default: turning it on is the parent's decision, and
// a school where nobody has chosen keeps the counter working as it did.
requiresParentApproval: {
  type: Boolean,
  default: false
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
    // New writes are WEEKLY only (updateWalletControl refuses the rest), but
    // DAILY and MONTHLY stay in the enum so students saved before that rule
    // still validate — save() checks every path, not just the changed one.
    enum: ["DAILY", "WEEKLY", "MONTHLY"],
    default: "WEEKLY"
  }
}
  // parentPassword: { type: String, default: null } // Stored directly here to bind parent to student record safely
}, { timestamps: true });

// Prevent duplicate entries for the exact same student setup
studentSchema.index({ name: 1, fatherName: 1, parentPhoneNumber: 1 }, { unique: true });
studentSchema.index({ active: 1, name: 1 });

export default mongoose.model('Student', studentSchema);
