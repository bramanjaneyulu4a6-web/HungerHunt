import Student from '../models/Student.js';
import Transaction from '../models/Transaction.js';
import Parent from "../models/Parent.js";
import Inventory from "../models/Inventory.js";
import bcrypt from "bcryptjs";
import { sendNotification } from "../utils/sendNotification.js";
import {
  AUTHORIZATION_MESSAGES,
  consumeAuthorization,
  graceUntil,
  issueAuthorization,
  unverifiedBillsAccepted,
} from "../utils/purchaseAuthorization.js";

const periodStart = (limitType) => {
  const now = new Date();

  if (limitType === "DAILY") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  if (limitType === "WEEKLY") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    return start;
  }

  return new Date(now.getFullYear(), now.getMonth(), 1);
};

// Puts stock back after a partially-applied checkout.
const restoreStock = async (applied) => {
  for (const { productId, quantity } of applied) {
    try {
      await Inventory.updateOne({ productId }, { $inc: { stock: quantity } });
    } catch (err) {
      console.error("Stock rollback failed for product", productId, err);
    }
  }
};

export const generateBill = async (req, res) => {
  const { studentId, items, purchaseToken } = req.body;

  if (!studentId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'A student and at least one item are required.' });
  }

  if (items.some((i) => !i.productId || !Number.isInteger(i.quantity) || i.quantity <= 0)) {
    return res.status(400).json({ message: 'Every item needs a product and a positive whole quantity.' });
  }

  const applied = [];

  try {
    // The parent's purchase password is checked by verifyPayment, which hands
    // back a token bound to this student and this exact cart. Spending it here
    // is what makes that check part of the charge instead of a step the client
    // is trusted to have taken.
    //
    // It is spent before anything else happens, so a bill that fails later
    // cannot leave a live token behind. That does cost the cashier a second
    // password when a sale loses a stock race — but that path already asks
    // them to review the cart, and a different cart needs its own token.
    const authorization = await consumeAuthorization({
      token: purchaseToken,
      studentId,
      items,
    });

    if (!authorization.ok) {
      const grace = authorization.reason === 'missing' && unverifiedBillsAccepted();

      if (!grace) {
        // Not 401: the kiosk signs itself out on one, and this cashier is
        // properly signed in — it is this charge that is unauthorised.
        return res.status(403).json({ message: AUTHORIZATION_MESSAGES[authorization.reason] });
      }

      console.warn(
        `Charged student ${studentId} on a bill carrying no purchase authorization.` +
        ` Accepted until ${graceUntil().toISOString()} — this client is running a build` +
        ` from before verify-payment issued a token.`
      );
    }

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ message: 'Student record not found.' });

    let totalAmount = 0;
    const transactionItems = [];

    for (const orderItem of items) {
      const inventory = await Inventory.findOne({
        productId: orderItem.productId
      }).populate("productId");

      if (!inventory || !inventory.productId) {
        return res.status(404).json({ message: "Inventory record not found." });
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

    if (student.walletControl?.enabled) {
      const spent = await Transaction.aggregate([
        {
          $match: {
            studentId: student._id,
            createdAt: { $gte: periodStart(student.walletControl.limitType) }
          }
        },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } }
      ]);

      const alreadySpent = spent.length > 0 ? spent[0].total : 0;
      const remainingLimit = Math.max(0, student.walletControl.limitAmount - alreadySpent);

      if (totalAmount > remainingLimit) {
        return res.status(400).json({
          message: `${student.walletControl.limitType} limit exceeded. Remaining limit ₹${remainingLimit}`
        });
      }
    }

    // Decrement conditionally so two simultaneous kiosks can never oversell.
    // Anything already applied is restored if a later step fails.
    for (const orderItem of items) {
      const updated = await Inventory.findOneAndUpdate(
        { productId: orderItem.productId, stock: { $gte: orderItem.quantity } },
        { $inc: { stock: -orderItem.quantity } },
        { new: true }
      );

      if (!updated) {
        await restoreStock(applied);
        return res.status(409).json({
          message: "Stock changed while checking out. Please review the cart and try again."
        });
      }

      applied.push({ productId: orderItem.productId, quantity: orderItem.quantity });
    }

    // Same guard on the wallet: the balance must still cover the bill.
    const debited = await Student.findOneAndUpdate(
      { _id: studentId, pocketMoney: { $gte: totalAmount } },
      { $inc: { pocketMoney: -totalAmount } },
      { new: true }
    );

    if (!debited) {
      await restoreStock(applied);
      return res.status(400).json({ message: 'Insufficient pocket money balance!' });
    }

    let transaction;
    try {
      transaction = await Transaction.create({
        studentId,
        items: transactionItems,
        totalAmount,
        previousBalance: debited.pocketMoney + totalAmount,
        remainingBalance: debited.pocketMoney
      });
    } catch (err) {
      await restoreStock(applied);
      await Student.updateOne({ _id: studentId }, { $inc: { pocketMoney: totalAmount } });
      throw err;
    }

    const parent = await Parent.findOne({ studentIds: studentId });

    if (parent?.fcmToken) {
      await sendNotification(
        parent.fcmToken,
        "🛒 Purchase Alert",
        `Spent ₹${totalAmount}. Balance ₹${debited.pocketMoney}`,
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
    const page = Math.max(parseInt(req.query.page) || 0, 0);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 0, 0), 500);

    const query = Transaction.find()
      .populate('studentId', 'name grade')
      .sort({ createdAt: -1 });

    // Paginated only when asked for, so existing callers keep the full list.
    if (page > 0 && limit > 0) {
      const [transactions, total] = await Promise.all([
        query.skip((page - 1) * limit).limit(limit),
        Transaction.countDocuments(),
      ]);

      return res.json({ transactions, total, page, pages: Math.ceil(total / limit) });
    }

    res.json(await query);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { studentId, phone, password, items } = req.body;

    const student = await Student.findById(studentId).select('+purchasePassword');

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    if (student.parentPhoneNumber !== phone) {
      return res.status(400).json({ message: "Wrong mobile number" });
    }

    if (!student.purchasePassword) {
      return res.status(400).json({
        message: "No purchase password has been set for this student yet."
      });
    }

    if (!password) {
      return res.status(400).json({ message: "Purchase password is required" });
    }

    const matched = await bcrypt.compare(password, student.purchasePassword);

    if (!matched) {
      return res.status(400).json({ message: "Wrong purchase password" });
    }

    // The token is bound to a cart, so it can only be issued to a client that
    // says what it is paying for. One that sends no items is a build from
    // before this existed: it gets the bare answer it expects, and its bill is
    // carried by the grace window in utils/purchaseAuthorization.js until that
    // date passes. Sending items but getting them wrong is a bug worth seeing.
    let purchaseToken;

    if (items !== undefined) {
      if (
        !Array.isArray(items) ||
        items.length === 0 ||
        items.some((i) => !i.productId || !Number.isInteger(i.quantity) || i.quantity <= 0)
      ) {
        return res.status(400).json({
          message: 'Every item needs a product and a positive whole quantity.'
        });
      }

      purchaseToken = await issueAuthorization({ studentId: student._id, items });
    }

    res.json({ success: true, purchaseToken });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
