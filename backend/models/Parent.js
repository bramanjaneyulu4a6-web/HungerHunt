// import mongoose from "mongoose";

// const parentSchema = new mongoose.Schema(
// {
//   fatherName: String,
//   phone: {
//     type: String,
//     unique: true
//   },
//   password: String,

//   studentIds: [
//     {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Student"
//     }
//   ]
// },
// { timestamps: true }
// );

// export default mongoose.model("Parent", parentSchema);







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
  fcmToken: {
  type: String,
  default: null
}
},
{ timestamps: true }
);

export default mongoose.model("Parent", parentSchema);