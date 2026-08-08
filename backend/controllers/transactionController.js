import Student from '../models/Student.js';
import Transaction from '../models/Transaction.js';
import Parent from "../models/Parent.js";
import bcrypt from "bcryptjs";
import { sendToParent } from "../utils/sendNotification.js";
import { chargeCart } from "../utils/checkout.js";
import {
  AUTHORIZATION_MESSAGES,
  consumeAuthorization,
  graceUntil,
  issueAuthorization,
  unverifiedBillsAccepted,
} from "../utils/purchaseAuthorization.js";

export const generateBill = async (req, res) => {
  const { studentId, items, purchaseToken } = req.body;

  if (!studentId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'A student and at least one item are required.' });
  }

  if (items.some((i) => !i.productId || !Number.isInteger(i.quantity) || i.quantity <= 0)) {
    return res.status(400).json({ message: 'Every item needs a product and a positive whole quantity.' });
  }

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

    // Pricing, the limit check, the conditional stock and wallet writes and
    // their rollbacks all live in chargeCart, which the approval flow charges
    // through as well. Both routes end at the same money.
    const charge = await chargeCart({ studentId, items });

    if (!charge.ok) {
      return res.status(charge.status).json({ message: charge.message });
    }

    const { transaction, student } = charge;

    const parent = await Parent.findOne({ studentIds: studentId });

    if (parent) {
      // Not awaited: the till gets its response now, and the notification goes
      // out on its own. sendToParent never rejects.
      sendToParent(
        parent,
        "🛒 Purchase Alert",
        `Spent ₹${transaction.totalAmount}. Balance ₹${student.pocketMoney}`,
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
      return res.status(400).json({ message: "Wrong purchase code" });
    }

    /* The one moment the stored code is in plain sight. A student set up before
       codes were four digits is not known to have one, and nothing can ask the
       hash — so if what just worked is four digits, that is recorded here and
       the counter shows them a number pad from now on. Most students never had
       anything else and heal on their first purchase.
       purchaseCodeAudit.js counts the ones that have not. */
    if (!student.purchaseCodeIsPin && /^\d{4}$/.test(password)) {
      await Student.updateOne({ _id: student._id }, { purchaseCodeIsPin: true });
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

    // The till asks for the password the same way either way; what changes is
    // where it takes the answer next. Reporting it here rather than making the
    // till look the student up again keeps the two in step — the flag is read
    // from the same document whose password was just accepted.
    res.json({
      success: true,
      purchaseToken,
      requiresApproval: Boolean(student.requiresParentApproval),
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
