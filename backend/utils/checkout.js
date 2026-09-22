import Student from '../models/Student.js';
import Transaction from '../models/Transaction.js';
import Inventory from '../models/Inventory.js';
import { businessPeriodStart } from './businessTime.js';
import { createFulfillmentOrder } from './fulfillment.js';
import WalletReversal from '../models/WalletReversal.js';
import { checkPurchaseLimits, CLOSED_CATEGORY_MESSAGE, productInClosedCategory } from './purchaseLimits.js';
import { creditWallet, debitWallet } from './walletAccount.js';
import { mintReceiptNumber } from './walletReceipts.js';
import { isTestAccountStudent } from './testAccount.js';
import { isDemoStudent } from './demoAccount.js';
import { checkWeeklyOrderLimit } from './weeklyOrderLimit.js';
import {
  DEMO_LOW_BALANCE,
  DEMO_OPENING_BALANCE,
  isDemoParentPhone,
} from '../config/demoAccess.js';

/* Charging a wallet is now reached two ways — the till billing at the counter,
   and a parent approving a request raised earlier — and both have to be equally
   careful. This is that care, written once.
 *
 * It was extracted from generateBill when the approval flow arrived, because
 * the version that arrived with it did the same job by hand: unconditional
 * stock decrements, a read-modify-write on the balance, and no rollback. Two
 * kiosks could oversell the last samosa, and a failure after the debit left the
 * money gone and the sale unrecorded. Those are exactly the bugs generateBill
 * was fixed for, so the fix lives somewhere both callers reach instead.
 */

// Puts stock back after a partially-applied checkout.
const restoreStock = async (applied, session = null) => {
  for (const { productId, quantity } of applied) {
    try {
      await Inventory.updateOne(
        { productId },
        { $inc: { stock: quantity } },
        session ? { session } : undefined
      );
    } catch (err) {
      console.error("Stock rollback failed for product", productId, err);
    }
  }
};

/* Prices a cart against live inventory and charges it, or explains why not.
 *
 * Returns { ok: true, transaction, student } on success and
 * { ok: false, status, message } on any refusal, so the caller decides what an
 * HTTP response looks like. Amounts are always recomputed here from Inventory
 * rather than trusted from the caller — a request that names its own prices is
 * a request that can name its own total. */
export const chargeCart = async ({
  studentId,
  items,
  session = null,
  sourceType = 'DIRECT_CHECKOUT',
  sourceId,
  idempotencyKey,
  funding = 'WALLET',
  performedBy = null,
}) => {
  const studentQuery = Student.findById(studentId);
  const student = session ? await studentQuery.session(session) : await studentQuery;

  if (!student || student.active === false) {
    return { ok: false, status: 404, message: 'Student record not found.' };
  }

  /* The demo account never gets this far: generateBill answers it before the
     transaction opens, and that short-circuit is what actually delivers "the
     order is not saved". This is the backstop under it.

     It is a refusal rather than a silent success because of which way the two
     failures point. A demo student that slipped through and was charged would
     write a real transaction, move real stock and raise a real package for a
     child who does not exist — and nobody would find out until the storeroom
     tried to pick it. A demo student refused here breaks the demo loudly, in
     front of the person running it. The second is the one worth having. */
  if (await isDemoStudent(student, { session })) {
    return {
      ok: false,
      status: 409,
      message: 'Demo accounts cannot be charged. Nothing was recorded.',
    };
  }

  /* The showroom family's orders are real in every other respect — a real
     transaction, a real package, a real wallet debit — but they must not eat
     the shelves. Five baskets per visitor across an open day would drain stock
     no student ever received, and the storeroom's counts would drift by however
     many people walked past the tablet.

     Skipped rather than put back afterwards. Restoring on collection would
     leave the shelf short for as long as a visitor took to finish, and short
     indefinitely if they wandered off mid-demo — a shortfall nobody could
     explain from the till, because the order it belonged to had deleted
     itself. Never taking it has no window to get stuck in.

     Asked once, here, because it governs two separate steps below: the shelf
     is neither checked nor decremented. A demo basket is therefore priced and
     sold against an empty shelf, which is the right way round — a visitor
     shown an item they could not really have costs nothing, and a real student
     turned away from a shelf a demo emptied costs a meal. */
  /* Read straight off the document rather than through isDemoParentStudent.
     The student is already loaded here, unprojected, so the phone is in hand —
     and asking the helper would spend a second query to learn what this row
     already says. A caller holding a partial student would send that query
     somewhere it cannot be answered. */
  const demoParentOrder = isDemoParentPhone(student.parentPhoneNumber);

  let totalAmount = 0;
  const transactionItems = [];
  const limitedEntries = [];

  /* The whole cart is read in one query rather than one per line.
   *
   * Each line used to cost two round trips — the findOne, then a second query
   * behind populate to fetch the product — and the service talks to Atlas
   * across a region boundary, so those trips are ~245ms each no matter how
   * fast the query itself is. A five-line basket spent over two seconds
   * waiting on a database that answered every one of those queries in under a
   * millisecond.
   *
   * Only the fetch is batched. Every check below still runs per line, in cart
   * order, against the same row findOne would have returned — so the first
   * line to fail is still the one the customer is told about, and the refusal
   * is still the same refusal. */
  const readCart = async () => {
    if (!items.length) return [];

    const query = Inventory.find({
      productId: { $in: items.map((orderItem) => orderItem.productId) }
    }).populate("productId");

    return session ? query.session(session) : query;
  };

  const inventoryRows = await readCart();

  /* Keyed by the product the cart line names, so a miss below means exactly
     what findOne returning null used to mean. A row whose product has been
     deleted populates to null and therefore keys to nothing, which lands on
     the same "Inventory record not found." the null check below already gave
     it — the check stays anyway, because it costs nothing and this map is not
     the only way a row can arrive without a product. */
  const inventoryByProduct = new Map(
    inventoryRows.map((row) => {
      const product = row.productId;
      const key = product && typeof product === "object" && product._id
        ? product._id
        : product;
      return [String(key), row];
    })
  );

  for (const orderItem of items) {
    const inventory = inventoryByProduct.get(String(orderItem.productId));

    if (!inventory || !inventory.productId) {
      return { ok: false, status: 404, message: "Inventory record not found." };
    }

    // Archived is off sale everywhere, including a till that loaded its menu
    // this morning and still shows the product. Absent means active — rows
    // from before the flag never carried one.
    if (inventory.productId.active === false) {
      return {
        ok: false,
        status: 400,
        message: `${inventory.productId.name} is no longer sold.`
      };
    }

    if (!demoParentOrder && inventory.stock < orderItem.quantity) {
      return {
        ok: false,
        status: 400,
        message: `Insufficient stock for ${inventory.productId.name}`
      };
    }

    // Parent approvals carry the snapshotted price displayed in the confirm
    // dialog. Direct checkout has no snapshot and uses the live catalogue.
    const unitPrice = orderItem.price ?? inventory.productId.price;

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { ok: false, status: 409, message: 'The approved order has an invalid price.' };
    }

    totalAmount += unitPrice * orderItem.quantity;

    transactionItems.push({
      productId: inventory.productId._id,
      name: inventory.productId.name,
      quantity: orderItem.quantity,
      price: unitPrice
    });

    limitedEntries.push({ product: inventory.productId, quantity: orderItem.quantity });
  }

  // A category the office has switched off sells nothing, however the order
  // arrived — a till menu loaded before the switch, or a request raised
  // before it and approved after.
  const closed = await productInClosedCategory(limitedEntries.map((entry) => entry.product), session);
  if (closed) {
    return { ok: false, status: 400, code: 'CATEGORY_DISABLED', message: CLOSED_CATEGORY_MESSAGE(closed) };
  }

  // Per-product limits are judged against the same populated rows the price
  // came from, and before any stock or wallet is touched, so a refusal costs
  // nothing to undo. Checked here rather than in either controller because
  // the till and the parent's approval both arrive at this function.
  const withinLimits = await checkPurchaseLimits({
    studentId: student._id,
    entries: limitedEntries,
    session,
    excludePendingOrderId: sourceType === 'PARENT_APPROVAL' ? sourceId : null,
    student,
  });

  if (!withinLimits.ok) return withinLimits;

  // One order a week, asked where money moves. The waiting order this charge
  // pays for is excluded, or approving it would be refused for existing.
  const weekly = await checkWeeklyOrderLimit({
    student,
    session,
    excludePendingOrderId:
      sourceType === 'PARENT_APPROVAL' || sourceType === 'UPI_ORDER_PAYMENT' ? sourceId : null,
  });
  if (!weekly.ok) return weekly;

  // The weekly cap is the parent's rule for their own child. The PhonePe
  // reviewer's children are exempt for the same reason the product limits
  // above are: a review has to be able to keep ordering. Real families are
  // untouched — see utils/testAccount.js for what makes a student a test one.
  const testStudent = await isTestAccountStudent(student, { session });

  if (funding === 'WALLET' && student.walletControl?.enabled && !testStudent) {
    const spendingQuery = Transaction.aggregate([
      {
        $match: {
          studentId: student._id,
          createdAt: { $gte: businessPeriodStart(student.walletControl.limitType) },
          // UPI-paid orders are the parent's own money, spent with the
          // parent's own thumb on the pay button. They neither need the
          // child-spending limit's consent nor consume its allowance.
          sourceType: { $ne: 'UPI_ORDER_PAYMENT' },
          // A deleted charge's money went back to the wallet; it spent nothing.
          deletion: null,
        }
      },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } }
    ]);
    const spent = session ? await spendingQuery.session(session) : await spendingQuery;
    const reversalQuery = WalletReversal.aggregate([
      { $match: { studentId: student._id, createdAt: { $gte: businessPeriodStart(student.walletControl.limitType) } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const reversals = session ? await reversalQuery.session(session) : await reversalQuery;

    const grossSpent = spent.length > 0 ? spent[0].total : 0;
    const reversed = reversals.length > 0 ? reversals[0].total : 0;
    const alreadySpent = Math.max(0, grossSpent - reversed);
    const remainingLimit = Math.max(0, student.walletControl.limitAmount - alreadySpent);

    if (totalAmount > remainingLimit) {
      return {
        ok: false,
        status: 400,
        message: `${student.walletControl.limitType} limit exceeded. Remaining limit ₹${remainingLimit}`
      };
    }
  }

  // Decrement conditionally so two simultaneous kiosks can never oversell.
  // Anything already applied is restored if a later step fails.
  const applied = [];

  for (const orderItem of demoParentOrder ? [] : items) {
    const updated = await Inventory.findOneAndUpdate(
      { productId: orderItem.productId, stock: { $gte: orderItem.quantity } },
      { $inc: { stock: -orderItem.quantity } },
      { new: true, ...(session ? { session } : {}) }
    );

    if (!updated) {
      await restoreStock(applied, session);
      return {
        ok: false,
        status: 409,
        message: "Stock changed while checking out. Please review the cart and try again."
      };
    }

    applied.push({ productId: orderItem.productId, quantity: orderItem.quantity });
  }

  // WALLET funding spends the child's balance; EXTERNAL funding is money
  // that already arrived from outside (a parent's UPI payment), so the
  // wallet is left exactly as it was and the transaction records an
  // unchanged before/after as proof it was never touched.
  let debited = student;

  /* The showroom wallet fills itself back up before it is spent.
     
     Collecting a package resets the balance, so in ordinary use it is 3000 at
     the start of every order and this never fires. What it catches is the one
     case that reset cannot: a visitor who approved an order and walked away
     before collecting it. That order never completes, so its money stays
     spent — and enough of them would leave the account unable to afford the
     next basket, which is a demo that has quietly broken itself in front of
     the next family to pick up the tablet.

     Topped up when the balance is low OR when it simply cannot cover this
     basket, because either one ends the demonstration. Only ever for a demo
     account: a real child's empty wallet is the whole point of the refusal
     below, and must keep working exactly as it does. */
  if (
    demoParentOrder &&
    funding === 'WALLET' &&
    (student.pocketMoney < DEMO_LOW_BALANCE || student.pocketMoney < totalAmount)
  ) {
    const refilled = await Student.findOneAndUpdate(
      { _id: studentId },
      { $set: { pocketMoney: DEMO_OPENING_BALANCE } },
      { new: true, ...(session ? { session } : {}) }
    );

    if (refilled) student.pocketMoney = refilled.pocketMoney;
  }

  if (funding === 'WALLET') {
    debited = await debitWallet(studentId, totalAmount, { session });

    if (!debited) {
      await restoreStock(applied, session);
      return { ok: false, status: 400, message: 'Insufficient pocket money balance!' };
    }
  }

  let transaction;
  let fulfillmentOrder;

  try {
    /* A UPI-funded order is money that entered the school's books directly,
       so it is receipted like a desk payment and numbered as it is written.
       Wallet-funded charges spend money that was already receipted on its way
       in, and take no number of their own. */
    const receiptNumber =
      sourceType === 'UPI_ORDER_PAYMENT'
        ? await mintReceiptNumber({ studentId, admissionNumber: student.admissionNumber })
        : null;

    const transactionDocument = {
      studentId,
      items: transactionItems,
      totalAmount,
      previousBalance: funding === 'WALLET' ? debited.pocketMoney + totalAmount : student.pocketMoney,
      remainingBalance: funding === 'WALLET' ? debited.pocketMoney : student.pocketMoney,
      sourceType,
      ...(sourceId ? { sourceId } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(receiptNumber ? { receiptNumber } : {}),
      ...(performedBy ? { performedBy } : {}),
    };

    if (session) {
      [transaction] = await Transaction.create([transactionDocument], { session });
    } else {
      transaction = await Transaction.create(transactionDocument);
    }

    if (session) {
      fulfillmentOrder = await createFulfillmentOrder({ transaction, student, session });
    }
  } catch (err) {
    await restoreStock(applied, session);
    if (funding === 'WALLET') await creditWallet(studentId, totalAmount, { session });
    throw err;
  }

  return { ok: true, transaction, fulfillmentOrder, student: debited };
};
