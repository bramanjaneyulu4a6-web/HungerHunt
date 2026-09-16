import Parent from '../models/Parent.js';
import Product from '../models/Product.js';
import Student from '../models/Student.js';
import Transaction from '../models/Transaction.js';
import WalletReversal from '../models/WalletReversal.js';
import FulfillmentOrder from '../models/FulfillmentOrder.js';
import PendingOrder, { pendingOrderExpiry } from '../models/PendingOrder.js';
import { OrderStatus } from '../src/domain/fulfillment/orderState.js';
import { DEMO_OPENING_BALANCE, isDemoParentPhone } from '../config/demoAccess.js';
import { isDemoParentStudent } from './demoParent.js';
import { buildDemoBaskets, nextBasketAfter } from './demoBaskets.js';

/* Putting the showroom family back where it started.
 *
 * A demo order is a real order in every respect that matters to the screens it
 * appears on — a real transaction, a real package, a real wallet debit, a real
 * walk through the warehouse state machine. That is the point: a visitor is
 * shown the flow, not a picture of it. What stops the demo silting up is this
 * file: however an order ends, everything it created is removed and the next
 * basket in the rotation is put in its place.
 *
 * An order can end four ways, and each has a hook:
 *   - collected (the parent simulating the warehouse, or a caretaker taking the
 *     student's code)            -> resetDemoOrder
 *   - cancelled by staff before dispatch -> resetDemoOrder, after the refund
 *   - rejected by the parent     -> resetDemoRequest
 *   - left to lapse              -> healDemoAccount, when the parent app looks
 * and healDemoAccount doubles as the net under all of them: whenever the demo
 * parent's app lists its requests and finds nothing waiting and nothing on its
 * way, it clears the leftovers and seeds a basket. A path nobody thought of
 * therefore strands the account only until the next refresh.
 *
 * This is the one place in the codebase that deletes a Transaction. Money
 * remembers everywhere else, and it should: an order that was really placed is
 * a fact about a family. A demo order is not a fact about anybody. What keeps
 * the exception from spreading is the guard in each entry point — the
 * student's parent must be declared in DEMO_PARENT_PHONES, and with no list
 * there is no demo account, so none of this can fire.
 *
 * Every entry point swallows its own failures. This is housekeeping for an
 * account that is not a real family, and it runs inside paths that real
 * families depend on — a caretaker handing over food, a parent rejecting a
 * request, a parent opening the app. None of them may fail because the
 * showroom account's cleanup went wrong. The cost of swallowing is a stale
 * basket on one tablet, fixed by `npm run parent:demo -- --reset --apply`.
 */

const OPEN_REQUEST = ['PENDING', 'PROCESSING'];
const FINISHED_PACKAGE = [OrderStatus.COLLECTED, OrderStatus.CANCELLED];

const nonFatal = (label, work) => async (...args) => {
  try {
    return await work(...args);
  } catch (error) {
    console.error(`Demo account ${label} failed`, error);
    return false;
  }
};

/* The next basket for a child, if the child is free to take one.
 *
 * Free means no request open and no package still on its way. The first is a
 * hard rule — one_pending_order_per_student would refuse the insert. The second
 * is the demo's own: one order at a time is what makes the five read as a
 * sequence, and seeding while a package was in flight would let a visitor pile
 * up approvals the rotation was never meant to hold. */
const seedNextBasket = async ({ studentId, parentId, afterItems = [] }) => {
  const [open, inFlight] = await Promise.all([
    PendingOrder.exists({ studentId, status: { $in: OPEN_REQUEST } }),
    FulfillmentOrder.exists({ studentId, status: { $nin: FINISHED_PACKAGE } }),
  ]);

  if (open || inFlight) return false;

  const catalogue = await Product.find({
    active: { $ne: false },
    kioskVisible: { $ne: false },
  })
    .select('name price')
    .lean();

  const next = nextBasketAfter(afterItems, buildDemoBaskets(catalogue));

  // A catalogue too thin to build from leaves nothing waiting rather than
  // inventing a basket. Better an empty demo than a broken one.
  if (!next) return false;

  await PendingOrder.create({
    studentId,
    parentId,
    items: next.items,
    totalAmount: next.totalAmount,
    status: 'PENDING',
    // A fresh window, or the basket would lapse partway through an open day.
    expiresAt: pendingOrderExpiry(),
  });

  return true;
};

// The parent a child's basket should be addressed to, for the paths that
// arrive holding only a package.
const parentIdFor = async (student) =>
  (await Parent.findOne({ phone: student.parentPhoneNumber }).select('_id').lean())?._id ?? null;

/* A package that has finished — collected, or cancelled before dispatch.
 *
 * The wallet is SET to the opening balance rather than refunded. Refunding is
 * the honest bookkeeping and would be the only defensible choice for a real
 * family, but it preserves whatever the balance happened to be, including
 * money lost to an earlier visitor who approved an order and walked away. A
 * stage prop should read the same to every visitor. */
export const resetDemoOrder = nonFatal('reset', async (order) => {
  if (!order?.studentId || !order?._id) return false;

  // Asked of the row rather than trusted from the caller: this deletes a
  // transaction, and does not take a caller's word that it is allowed to.
  const student = await Student.findById(order.studentId)
    .select('parentPhoneNumber')
    .lean();

  if (!(await isDemoParentStudent(student))) return false;

  // Read before anything is deleted: the request is what ties the package back
  // to the basket, and the basket is what decides which one comes next.
  const pending = order.transactionId
    ? await PendingOrder.findOne({ transactionId: order.transactionId })
        .select('parentId items')
        .lean()
    : null;

  // Money first, so a failure part way leaves the wallet whole.
  await Student.updateOne(
    { _id: order.studentId },
    { $set: { pocketMoney: DEMO_OPENING_BALANCE } }
  );

  await FulfillmentOrder.deleteOne({ _id: order._id });
  // A staff cancellation leaves a reversal and a numbered receipt behind it.
  await WalletReversal.deleteMany({ fulfillmentOrderId: order._id });

  if (order.transactionId) {
    await Transaction.deleteOne({ _id: order.transactionId });
    await PendingOrder.deleteOne({ transactionId: order.transactionId });
  }

  await seedNextBasket({
    studentId: order.studentId,
    parentId: pending?.parentId ?? (await parentIdFor(student)),
    afterItems: pending?.items ?? order.items,
  });

  return true;
});

/* A request the parent answered with no — or one that lapsed. Nothing was
   charged and nothing was packed, so there is only the request itself to
   clear before the next basket takes its place. */
export const resetDemoRequest = nonFatal('request reset', async (request) => {
  if (!request?.studentId || !request?._id) return false;

  const student = await Student.findById(request.studentId)
    .select('parentPhoneNumber')
    .lean();

  if (!(await isDemoParentStudent(student))) return false;

  await PendingOrder.deleteOne({ _id: request._id, status: { $nin: OPEN_REQUEST } });

  await seedNextBasket({
    studentId: request.studentId,
    parentId: request.parentId,
    afterItems: request.items,
  });

  return true;
});

/* The net under every path: called when the demo parent's app lists its
   requests. For each child with nothing waiting and nothing on its way, the
   leftovers — rejected and expired requests, and requests whose window has
   passed but whose status still says PENDING — are cleared, and a basket is
   seeded after the most recent of them.

   The lapsed-but-PENDING case is why this has to delete rather than merely
   seed. The parent list hides a request past its window without ever writing
   EXPIRED, and the unique index still counts it as open, so a new basket
   could not be inserted beside it. */
export const healDemoAccount = nonFatal('heal', async ({ parentId, phone }) => {
  if (!parentId || !isDemoParentPhone(phone)) return false;

  const children = await Student.find({ parentPhoneNumber: phone, active: { $ne: false } })
    .select('_id')
    .lean();

  let seeded = false;

  for (const { _id: studentId } of children) {
    const live = await PendingOrder.exists({
      studentId,
      status: { $in: OPEN_REQUEST },
      expiresAt: { $gt: new Date() },
    });

    if (live) continue;

    const leftovers = await PendingOrder.find({
      studentId,
      $or: [
        { status: { $in: ['REJECTED', 'EXPIRED'] } },
        { status: 'PENDING', expiresAt: { $lte: new Date() } },
      ],
    })
      .sort({ updatedAt: -1 })
      .select('_id items')
      .lean();

    if (leftovers.length) {
      await PendingOrder.deleteMany({ _id: { $in: leftovers.map((row) => row._id) } });
    }

    if (await seedNextBasket({ studentId, parentId, afterItems: leftovers[0]?.items })) {
      seeded = true;
    }
  }

  return seeded;
});
