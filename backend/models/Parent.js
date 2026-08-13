import mongoose from "mongoose";

const parentSchema = new mongoose.Schema(
{
  fatherName: String,

  phone: {
    type: String,
    unique: true
  },

  // ✅ ADD THIS
  email: {
    type: String,
    unique: true,
    required: true
  },

  password: String,

  studentIds: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student"
    }
  ],

  // ✅ ADD RESET PASSWORD FIELDS
  resetPasswordToken: String,
  resetPasswordExpire: Date,

  // Stamped into every token this account is issued and checked on every
  // request. Moving it invalidates each token stamped with the older number at
  // once, which is the only way to end a parent session early: they last seven
  // days, and before this there was nothing a password reset could do about the
  // ones already handed out.
  //
  // Starts at 0, and a token that predates the claim reads as 0 too, so adding
  // this signs nobody out.
  tokenVersion: {
    type: Number,
    default: 0,
  },

  // One device, one entry. The single fcmToken this replaced meant signing in
  // on the phone silently stopped the browser's notifications, and vice versa —
  // whichever device registered last was the only one that got told anything.
  pushTokens: [
    {
      _id: false,
      token: { type: String, required: true },
      platform: {
        type: String,
        enum: ["ios", "android", "web"],
        default: "web"
      },
      updatedAt: { type: Date, default: Date.now }
    }
  ],

  // Superseded by pushTokens. Kept so that tokens registered before this change
  // keep working: they are folded into pushTokens on first use and cleared.
  // Safe to drop once every parent has re-registered a device.
  fcmToken: {
    type: String,
    default: null
  }
},
{ timestamps: true }
);

parentSchema.index({ studentIds: 1 });

export default mongoose.model("Parent", parentSchema);
