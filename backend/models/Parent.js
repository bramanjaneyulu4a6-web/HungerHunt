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

export default mongoose.model("Parent", parentSchema);