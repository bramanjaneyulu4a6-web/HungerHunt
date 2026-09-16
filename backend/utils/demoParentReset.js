import Student from '../models/Student.js';
import Transaction from '../models/Transaction.js';
import FulfillmentOrder from '../models/FulfillmentOrder.js';
import PendingOrder, { pendingOrderExpiry } from '../models/PendingOrder.js';
import { DEMO_OPENING_BALANCE } from '../config/demoAccess.js';
import { isDemoParentStudent } from './demoParent.js';
import Product from '../models/Product.js';
import { buildDemoBaskets, nextBasketAfter } from './demoBaskets.js';

/* Putting the showroom family back where it started.
 *
 * A demo order is a real order in every respect that matters to the screens it
 * appears on — a real transaction, a real package, a real wallet debit, a real
 * walk through the warehouse state machine. That is the point: a visitor is
 * shown the flow, not a picture of it. What stops the demo silting up is this:
 * the moment a package is collected, everything it created is removed and the
 * basket is put back as a fresh request, so the next visitor finds the account
 * exactly as the last one did.
 *
 * Collection is the trigger because it is where a real order ends too. There
 * are two ways to reach it — the parent simulating the warehouse, and a
 * student's purchase code at the dorm door — and both call this, because a
 * reset that only fired on one would leave orders stranded depending on how
 * they happened to finish.
 *
 * This is the one place in the codebase that deletes a Transaction. Money
 * remembers everywhere else, and it should: an order that was really placed is
 * a fact about a family. A demo order is not a fact about anybody, and leaving
 * five of them behind per visitor would bury the account's real shape within a
 * morning. What keeps that exception from spreading is the guard below — the
 * student's parent must be declared in DEMO_PARENT_PHONES, and with no list
 * there is no demo account, so this cannot fire at all.
 */
export const resetDemoOrder = async (order) => {
  try {
    return await clearAndReseed(order);
  } catch (error) {
    /* Housekeeping for an account that is not a real family must never fail
       the collection it follows. A caretaker at a dorm door scanning a real
       student's package cannot be handed a 500 because the demo account's
       cleanup went wrong — so this is reported and swallowed, the way
       restoreStock reports a failed rollback in utils/checkout.js.

       The cost of swallowing is a demo order that did not reset. That shows up
       as a stale basket on one tablet, and is fixed by re-running
       `npm run parent:demo -- --reset --apply`. The cost of not swallowing is
       a caretaker who cannot hand over food. */
    console.error('Demo order reset failed for', String(order?._id), error);
    return false;
  }
};

const clearAndReseed = async (order) => {
  if (!order?.studentId || !order?._id) return false;

  /* Asked of the row rather than trusted from the caller. Both call sites have
     already established the package is the demo parent's, but this deletes a
     transaction and refunds a wallet — it does not take that on trust from a
     caller that might later be changed. */
  const student = await Student.findById(order.studentId)
    .select('parentPhoneNumber')
    .lean();

  if (!(await isDemoParentStudent(student))) return false;

  /* Read before the transaction is deleted, because this is the only thing
     tying the package back to the request that raised it — and the request is
     what has to be put back. A demo order with no pending row behind it was
     rung up some other way; it is still cleared, there is just nothing to
     re-seed from. */
  const pending = await PendingOrder.findOne({ transactionId: order.transactionId })
    .select('parentId items totalAmount')
    .lean();

  /* Money first. Every step after this removes something, and a failure part
     way through should leave the wallet whole rather than a balance short by
     an order that no longer exists to explain it.

     Set rather than credited back. Refunding exactly what this order spent
     would be the honest bookkeeping, and for a real family it would be the
     only defensible choice — but it also preserves whatever the balance
     happened to be, including money lost to an earlier visitor who approved an
     order and wandered off before collecting it. Those never reset, so the
     account would drift down over an open day until it could not afford the
     next basket. A stage prop should read the same to every visitor. */
  await Student.updateOne(
    { _id: order.studentId },
    { $set: { pocketMoney: DEMO_OPENING_BALANCE } }
  );

  await FulfillmentOrder.deleteOne({ _id: order._id });

  if (order.transactionId) {
    await Transaction.deleteOne({ _id: order.transactionId });
    await PendingOrder.deleteOne({ transactionId: order.transactionId });
  }

  /* The next basket in the rotation, not the one just finished. Five orders
     cannot wait at once — a student may hold only one open request — so the
     variety the demo promises is delivered in sequence instead. See
     utils/demoBaskets.js. */
  if (pending) {
    const catalogue = await Product.find({
      active: { $ne: false },
      kioskVisible: { $ne: false },
    })
      .select('name price')
      .lean();

    const next = nextBasketAfter(pending.items, buildDemoBaskets(catalogue));

    /* A catalogue too thin to build a basket from leaves the account with
       nothing waiting rather than re-seeding the order that was just cleared.
       Better an empty demo than one that repeats itself forever. */
    if (next) {
      await PendingOrder.create({
        studentId: order.studentId,
        parentId: pending.parentId,
        items: next.items,
        totalAmount: next.totalAmount,
        status: 'PENDING',
        // A fresh window, or the re-seeded basket would inherit the three days
        // the last one had already spent and lapse mid-open-day.
        expiresAt: pendingOrderExpiry(),
      });
    }
  }

  return true;
};
