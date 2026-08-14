import Student from '../models/Student.js';
import Transaction from '../models/Transaction.js';
import Inventory from '../models/Inventory.js';
import { businessPeriodStart } from './businessTime.js';
import { createFulfillmentOrder, findWeeklyFulfillment } from './fulfillment.js';
import WalletReversal from '../models/WalletReversal.js';
import { checkPurchaseLimits } from './purchaseLimits.js';

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
}) => {
  const studentQuery = Student.findById(studentId);
  const student = session ? await studentQuery.session(session) : await studentQuery;

  if (!student || student.active === false) {
    return { ok: false, status: 404, message: 'Student record not found.' };
  }

  // Running traffic always supplies a Mongo session through
  // withMongoTransaction. The sessionless path exists only for model-stubbed
  // unit tests, where there is no database in which a package could live.
  if (session) {
    const existingWeeklyOrder = await findWeeklyFulfillment({ studentId, session });
    if (existingWeeklyOrder) {
      return {
        ok: false,
        status: 409,
        code: 'WEEKLY_ORDER_LIMIT',
        message: 'This student has already placed an order this business week.',
      };
    }
  }

  let totalAmount = 0;
  const transactionItems = [];
  const limitedEntries = [];

  for (const orderItem of items) {
    const inventoryQuery = Inventory.findOne({
      productId: orderItem.productId
    }).populate("productId");
    const inventory = session ? await inventoryQuery.session(session) : await inventoryQuery;

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

    if (inventory.stock < orderItem.quantity) {
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

  // Per-product limits are judged against the same populated rows the price
  // came from, and before any stock or wallet is touched, so a refusal costs
  // nothing to undo. Checked here rather than in either controller because
  // the till and the parent's approval both arrive at this function.
  const withinLimits = await checkPurchaseLimits({
    studentId: student._id,
    entries: limitedEntries,
    session,
  });

  if (!withinLimits.ok) return withinLimits;

  if (student.walletControl?.enabled) {
    const spendingQuery = Transaction.aggregate([
      {
        $match: {
          studentId: student._id,
          createdAt: { $gte: businessPeriodStart(student.walletControl.limitType) }
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

  for (const orderItem of items) {
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

  // Same guard on the wallet: the balance must still cover the bill.
  const debited = await Student.findOneAndUpdate(
    { _id: studentId, pocketMoney: { $gte: totalAmount } },
    { $inc: { pocketMoney: -totalAmount } },
    { new: true, ...(session ? { session } : {}) }
  );

  if (!debited) {
    await restoreStock(applied, session);
    return { ok: false, status: 400, message: 'Insufficient pocket money balance!' };
  }

  let transaction;
  let fulfillmentOrder;

  try {
    const transactionDocument = {
      studentId,
      items: transactionItems,
      totalAmount,
      previousBalance: debited.pocketMoney + totalAmount,
      remainingBalance: debited.pocketMoney,
      sourceType,
      ...(sourceId ? { sourceId } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
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
    await Student.updateOne(
      { _id: studentId },
      { $inc: { pocketMoney: totalAmount } },
      session ? { session } : undefined
    );
    throw err;
  }

  return { ok: true, transaction, fulfillmentOrder, student: debited };
};
