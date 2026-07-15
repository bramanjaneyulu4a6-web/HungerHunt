import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
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

export default mongoose.model('Admin', adminSchema);