import Student from '../models/Student.js';
import Product from '../models/Product.js';
import Transaction from '../models/Transaction.js';
// import admin from "../config/firebase.js";
import Parent from "../models/Parent.js";
import Inventory from "../models/Inventory.js";
import bcrypt from "bcryptjs";
import { sendNotification } from "../utils/sendNotification.js";

export const generateBill = async (req, res) => {
  const { studentId, items } = req.body; // items syntax: [{ productId, quantity }]
  
  try {
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ message: 'Student record not found.' });

    let totalAmount = 0;
    let transactionItems = [];

    // Verify stock availability & Calculate costs
   for (const orderItem of items) {

  const inventory = await Inventory.findOne({
    productId: orderItem.productId
  }).populate("productId");

  if (!inventory) {
    return res.status(404).json({
      message: "Inventory record not found."
    });
  }

  if (inventory.stock < orderItem.quantity) {
    return res.status(400).json({
      message: `Insufficient stock for ${inventory.productId.name}`
    });
  }

  totalAmount += inventory.productId.price * orderItem.quantity;

  transactionItems.push({
    productId: inventory.productId._id,
    name: inventory.productId.name,
    quantity: orderItem.quantity,
    price: inventory.productId.price
  });
}

    // Wallet Balance Check
    if (student.pocketMoney < totalAmount) {
      return res.status(400).json({ message: 'Insufficient pocket money balance!' });
    }

    // Atomic adjustments alternative manual processing
    for (const orderItem of items) {

  await Inventory.findOneAndUpdate(
    {
      productId: orderItem.productId
    },
    {
      $inc: {
        stock: -orderItem.quantity
      }
    }
  );

}

    const previousBalance = student.pocketMoney;
    student.pocketMoney -= totalAmount;
    await student.save();

    const transaction = await Transaction.create({
      
      studentId,
      items: transactionItems,
      totalAmount,
      previousBalance,
      remainingBalance: student.pocketMoney
    });
    const parent = await Parent.findOne({
  studentIds: studentId
});

if (parent?.fcmToken) {
  await sendNotification(
    parent.fcmToken,
    "🛒 Purchase Alert",
    `Spent ₹${totalAmount}. Balance ₹${student.pocketMoney}`,
    {
      type: "TRANSACTION",
      studentId: studentId.toString(),
    }
  );
}

    res.status(201).json({ message: 'Checkout successful!', transaction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find().populate('studentId', 'name grade').sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};





export const verifyPayment = async (req, res) => {

    try {

        const {
            studentId,
            phone,
            password
        } = req.body;

        const student = await Student.findById(studentId);

        if (!student)
            return res.status(404).json({
                message:"Student not found"
            });

        if (student.parentPhoneNumber !== phone)
            return res.status(400).json({
                message:"Wrong mobile number"
            });

        const matched = await bcrypt.compare(
            password,
            student.purchasePassword
        );

        if (!matched)
            return res.status(400).json({
                message:"Wrong purchase password"
            });

        res.json({
            success:true
        });

    } catch(err){

        res.status(500).json({
            message:err.message
        });

    }

};