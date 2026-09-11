import Student from '../models/Student.js';
import Transaction from '../models/Transaction.js';
import Inventory from '../models/Inventory.js';
import { businessPeriodStart } from './businessTime.js';
import { createFulfillmentOrder } from './fulfillment.js';
import WalletReversal from '../models/WalletReversal.js';
import { checkPurchaseLimits } from './purchaseLimits.js';
import { creditWallet, debitWallet } from './walletAccount.js';
import { mintReceiptNumber } from './walletReceipts.js';
import { isTestAccountStudent } from './testAccount.js';

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
}) => {
  const studentQuery = Student.findById(studentId);
  const student = session ? await studentQuery.session(session) : await studentQuery;

  if (!student || student.active === false) {
    return { ok: false, status: 404, message: 'Student record not found.' };
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
    excludePendingOrderId: sourceType === 'PARENT_APPROVAL' ? sourceId : null,
    student,
  });

  if (!withinLimits.ok) return withinLimits;

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

  // WALLET funding spends the child's balance; EXTERNAL funding is money
  // that already arrived from outside (a parent's UPI payment), so the
  // wallet is left exactly as it was and the transaction records an
  // unchanged before/after as proof it was never touched.
  let debited = student;

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
