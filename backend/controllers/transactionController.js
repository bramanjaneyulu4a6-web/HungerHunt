import Student from '../models/Student.js';
import Transaction from '../models/Transaction.js';
import Parent from "../models/Parent.js";
import bcrypt from "bcryptjs";
import { sendToParent } from "../utils/sendNotification.js";
import { chargeCart } from "../utils/checkout.js";
import { purchaseCodeProblem } from "../utils/validation.js";
import { withMongoTransaction } from "../utils/mongoTransaction.js";
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

// Five misses and the checkout closes for a quarter of an hour. Four digits is
// ten thousand codes, which a patient person gets through in an afternoon if
// nothing stops them; this is what stops them. Short enough that a child who
// simply forgot can eat at the next break.
const MAX_CODE_ATTEMPTS = 5;
const CODE_LOCK_MINUTES = 15;

const CODE_LOCKED = {
  code: 'CODE_LOCKED',
  message:
    'Too many wrong codes. Checkout is locked for a few minutes — or a parent' +
    ' can set a new code in the app.',
};

/* Counting a miss must not decide whether the miss can be reported. Awaited so
   the count is reliable while the database is, but its failure is logged and
   swallowed: the answer to a wrong code is "wrong code", never a 500 because
   the tally could not be written. */
const recordCodeMiss = async (studentId, update) => {
  try {
    await Student.updateOne({ _id: studentId }, update);
  } catch (err) {
    console.error('Could not record a purchase code miss:', err);
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

    /* A student has one secret and it is four digits. Anything else is not a
       code anyone could have been given, so it is turned away before the
       database is touched, let alone bcrypt. That includes a code set before
       this rule: the counter no longer accepts one, and the way off it is the
       parent's account password — the only other secret in the system. */
    const problem = purchaseCodeProblem(password);

    if (problem) {
      return res.status(400).json({ message: problem });
    }

    const student = await Student.findById(studentId).select('+purchasePassword');

    if (!student || student.active === false) {
      return res.status(404).json({ message: "Student not found" });
    }

    if (!student.purchasePassword) {
      return res.status(400).json({
        message: "No purchase code has been set for this student yet."
      });
    }

    /* Before bcrypt, and deliberately blind to whether the code is right. A
       locked student who types the correct one is refused exactly as they are
       for a wrong one — answering the two differently would tell a guesser
       they had just found it. */
    if (student.purchaseCodeLockedUntil && student.purchaseCodeLockedUntil > new Date()) {
      return res.status(423).json(CODE_LOCKED);
    }

    const matched = await bcrypt.compare(password, student.purchasePassword);

    if (!matched) {
      // Consecutive, not cumulative: four misses spread across a term should
      // not leave a student one typo away from missing lunch.
      if ((student.purchaseCodeAttempts ?? 0) + 1 >= MAX_CODE_ATTEMPTS) {
        await recordCodeMiss(student._id, {
          $set: {
            purchaseCodeAttempts: 0,
            purchaseCodeLockedUntil: new Date(Date.now() + CODE_LOCK_MINUTES * 60 * 1000),
          },
        });

        return res.status(423).json(CODE_LOCKED);
      }

      await recordCodeMiss(student._id, { $inc: { purchaseCodeAttempts: 1 } });

      /* A student never confirmed to have a four-digit code may not be typing
         the wrong one — they may be on a code from before the rule, which
         nothing here can accept and no query can identify, since all that is
         stored is a hash. Same refusal either way, but they are told what else
         it might be so the family is sent somewhere useful instead of trying
         again. */
      return res.status(400).json({
        message: student.purchaseCodeIsPin
          ? "Wrong purchase code"
          : "Wrong purchase code. If this student's code was set before codes" +
            " became 4 digits, their parent needs to set a new one in the app.",
      });
    }

    // The code was right, so the run of misses ends here. Not awaited, and not
    // written when there is nothing to clear: this is bookkeeping, and the
    // person at the counter should not wait on it.
    if (student.purchaseCodeAttempts > 0 || student.purchaseCodeLockedUntil) {
      Student.updateOne(
        { _id: student._id },
        { $set: { purchaseCodeAttempts: 0, purchaseCodeLockedUntil: null } }
      ).catch((err) => console.error('Could not reset the code attempt count:', err));
    }

    /* The one moment the stored code is in plain sight, and the only way to
       learn that it is four digits — which is worth writing down, because a
       failure above reads differently once we know. Most students never had
       anything else and settle this on their first purchase.
       purchaseCodeAudit.js counts the ones that have not. */
    // Not awaited: this is bookkeeping, and the counter should not wait on it.
    // Losing one costs nothing — the next accepted code records it again.
    if (!student.purchaseCodeIsPin) {
      Student.updateOne({ _id: student._id }, { purchaseCodeIsPin: true }).catch(
        (err) => console.error("Could not record the purchase code format:", err)
      );
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
