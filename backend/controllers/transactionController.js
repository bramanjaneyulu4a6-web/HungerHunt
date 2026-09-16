import Transaction from '../models/Transaction.js';
import Parent from "../models/Parent.js";
import { sendToParent } from "../utils/sendNotification.js";
import Inventory from "../models/Inventory.js";
import { chargeCart } from "../utils/checkout.js";
import { DEMO_SESSION_SECONDS, isDemoStudent } from "../utils/demoAccount.js";
import { withMongoTransaction } from "../utils/mongoTransaction.js";
import { checkPurchaseCode } from "../src/domain/students/purchaseCodeCheck.js";
import {
  AUTHORIZATION_MESSAGES,
  consumeAuthorization,
  graceUntil,
  issueAuthorization,
  unverifiedBillsAccepted,
} from "../utils/purchaseAuthorization.js";

/* A demo checkout: the answer the kiosk would have got, with nothing behind it.
 *
 * It is not a stub that returns a constant. The purchase code is still spent
 * here, exactly once, against exactly this cart — a demo that skipped that
 * would be showing a parent a lock that is not there. And the lines are still
 * priced from the live catalogue, so the total the visitor sees is the total
 * the school actually charges.
 *
 * What it does not do is write. No wallet, no stock, no Transaction, no
 * FulfillmentOrder, no receipt number and no notification. The single write in
 * this whole path is the authorization row being deleted as it is claimed,
 * which is the deletion of something this same flow created a moment ago.
 *
 * Stock is priced but deliberately not checked: a visitor is demonstrating the
 * kiosk, not competing for the last samosa, and refusing their basket over a
 * shelf they are not going to empty would be a confusing end to a demo. The
 * shelf is safe either way, because nothing here decrements it.
 */
const settleDemoBill = async ({ studentId, items, purchaseToken }) => {
  const authorization = await consumeAuthorization({ token: purchaseToken, studentId, items });

  if (!authorization.ok && !(authorization.reason === 'missing' && unverifiedBillsAccepted())) {
    return { status: 403, body: { message: AUTHORIZATION_MESSAGES[authorization.reason] } };
  }

  let totalAmount = 0;
  const lines = [];

  for (const orderItem of items) {
    const inventory = await Inventory.findOne({ productId: orderItem.productId }).populate('productId');

    if (!inventory?.productId) {
      return { status: 404, body: { message: 'Inventory record not found.' } };
    }

    const price = inventory.productId.price;

    totalAmount += price * orderItem.quantity;
    lines.push({
      productId: inventory.productId._id,
      name: inventory.productId.name,
      quantity: orderItem.quantity,
      price,
    });
  }

  /* Shaped like a real bill's response so the kiosk needs no demo branch of
     its own, but pointedly not a Transaction: no _id, because there is no row
     to fetch, and a `demo` flag so anything that ever does read this can tell
     it apart from a sale. */
  return {
    status: 201,
    body: {
      message: 'Checkout successful!',
      demo: true,
      transaction: { demo: true, studentId, items: lines, totalAmount, createdAt: new Date() },
      fulfillmentOrder: null,
    },
  };
};

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
    /* The showroom ending, decided before the transaction opens.
     *
     * Everything below this block writes: the wallet is debited, stock moves,
     * a Transaction and a FulfillmentOrder are created and the parent's phone
     * buzzes. A demo order must do none of it, and the cheapest way to be sure
     * is to never reach the code that does — rather than to thread a flag
     * through chargeCart, createFulfillmentOrder and sendToParent and rely on
     * every future edit to each of them remembering it exists.
     *
     * One extra projected read per bill is the price of that, on a route that
     * already opens a Mongo transaction. */
    if (await isDemoStudent(studentId)) {
      const demo = await settleDemoBill({ studentId, items, purchaseToken });

      return res.status(demo.status).json(demo.body);
    }

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
      .populate('studentId', 'name className section grade')
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

      /* The demo account keeps the code step — a parent watching their child
         be unable to spend without it is most of what the demo is for — but
         not the two-minute window on it, which is set for a counter where the
         next event is an HTTP request rather than a conversation. */
      purchaseToken = await issueAuthorization({
        studentId: student._id,
        items,
        ...(student.demoAccount === true ? { ttlSeconds: DEMO_SESSION_SECONDS } : {}),
      });
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
