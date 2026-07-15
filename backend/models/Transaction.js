import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    quantity: Number,
    price: Number
  }],
  totalAmount: { type: Number, required: true },
  previousBalance: { type: Number, required: true },
  remainingBalance: { type: Number, required: true },
}, { timestamps: true });

export default mongoose.model('Transaction', transactionSchema);