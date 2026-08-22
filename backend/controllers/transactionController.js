import Transaction from '../models/Transaction.js';
import Parent from "../models/Parent.js";
import { sendToParent } from "../utils/sendNotification.js";
import { chargeCart } from "../utils/checkout.js";
import { withMongoTransaction } from "../utils/mongoTransaction.js";
import { checkPurchaseCode } from "../src/domain/students/purchaseCodeCheck.js";
import {
  AUTHORIZATION_MESSAGES,
  consumeAuthorization,
  graceUntil,
  issueAuthorization,
  unverifiedBillsAccepted,
} from "../utils/purchaseAuthorization.js";

export const generateBill = async (req, res) => {
  // As in verifyPayment: a student session names its own student, and the
  // admin console says which one it is serving.
  const studentId = req.student?.id ?? req.body.studentId;
  const { items, purchaseToken } = req.body;

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
    // cannot leave a live token behind. That does cost the student a second
    // code entry when a sale loses a stock race — but that path already sends
    // them back to the cart, and a different cart needs its own token.
    const outcome = await withMongoTransaction(async (session) => {
      const authorization = await consumeAuthorization({
        token: purchaseToken,
        studentId,
        items,
        session,
      });

      if (!authorization.ok) {
        const grace = authorization.reason === 'missing' && unverifiedBillsAccepted();

        if (!grace) return { authorization };

        console.warn(
          `Charged student ${studentId} on a bill carrying no purchase authorization.` +
          ` Accepted until ${graceUntil().toISOString()} — this client is running a build` +
          ` from before verify-payment issued a token.`
        );
      }

      // Authorization claim, inventory, wallet and ledger commit together.
      return {
        charge: await chargeCart({ studentId, items, session }),
      };
    });

    if (outcome.authorization) {
      // Not 401: the kiosk signs itself out on one, and this session is
      // perfectly good — it is this charge that is unauthorised.
      return res.status(403).json({
        message: AUTHORIZATION_MESSAGES[outcome.authorization.reason],
      });
    }

    const { charge } = outcome;

    if (!charge.ok) {
      return res.status(charge.status).json({ message: charge.message });
    }

    const { transaction, fulfillmentOrder, student } = charge;

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

    res.status(201).json({ message: 'Checkout successful!', transaction, fulfillmentOrder });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
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

    res.json(await query.limit(500));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    /* Who is paying is settled by whoever cleared the gate, not by the body. A
       student session names its own student, so a request naming someone else
       cannot reach their wallet. The admin console still says which student it
       is serving — it holds no student token, and consoles cached from before
       this deploy still call this route. */
    const studentId = req.student?.id ?? req.body.studentId;
    const { password, items } = req.body;

    if (!studentId) {
      return res.status(400).json({ message: "A student is required." });
    }

    /* The code is checked in src/domain/students/purchaseCodeCheck.js, which
       the caretaker's collection screen also calls. Both doors ask for the
       same secret, so both must share one miss count — see that file. */
    const check = await checkPurchaseCode({ studentId, code: password });

    if (!check.ok) return res.status(check.status).json(check.body);

    const { student } = check;

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
