import Student from '../models/Student.js';
import Transaction from '../models/Transaction.js';
import Inventory from '../models/Inventory.js';

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

/* Prices a cart against live inventory and charges it, or explains why not.
 *
 * Returns { ok: true, transaction, student } on success and
 * { ok: false, status, message } on any refusal, so the caller decides what an
 * HTTP response looks like. Amounts are always recomputed here from Inventory
 * rather than trusted from the caller — a request that names its own prices is
 * a request that can name its own total. */
export const chargeCart = async ({ studentId, items }) => {
  const student = await Student.findById(studentId);

  if (!student) {
    return { ok: false, status: 404, message: 'Student record not found.' };
  }

  let totalAmount = 0;
  const transactionItems = [];

  for (const orderItem of items) {
    const inventory = await Inventory.findOne({
      productId: orderItem.productId
    }).populate("productId");

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
      { new: true }
    );

    if (!updated) {
      await restoreStock(applied);
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
    { new: true }
  );

  if (!debited) {
    await restoreStock(applied);
    return { ok: false, status: 400, message: 'Insufficient pocket money balance!' };
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

  return { ok: true, transaction, student: debited };
};
