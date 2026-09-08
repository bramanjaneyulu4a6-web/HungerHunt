/* One student's wallet ledger: every movement, newest first.
 *
 * Lifted out of the parent's recharges endpoint when the admin console needed
 * the same history. Both callers get the same rows from the same queries,
 * which is the point — a parent phoning the office about a payment and the
 * admin who answers are then looking at one account of what happened, not two
 * assembled separately and free to disagree.
 *
 * Paging stays with the caller: this returns the whole sorted list, because
 * the totals each surface shows are counted from it.
 */
import FulfillmentOrder from '../models/FulfillmentOrder.js';
import PaymentIntent from '../models/PaymentIntent.js';
import Student from '../models/Student.js';
import Transaction from '../models/Transaction.js';
import WalletAdjustment from '../models/WalletAdjustment.js';
import WalletReversal from '../models/WalletReversal.js';
import { paiseToRupees } from '../src/domain/payments/money.js';
import { ensureReceiptNumbers } from './walletReceipts.js';

/* What the storeroom did with a package, for the console that has to answer
 * for it. Deliberately not in the parent's copy of this row: the parent's
 * packages endpoint answers "where is it and when is it due" and stops there,
 * while the office needs the staff acts and the name at the hostel door. */
export const fulfillmentDetail = (order) => {
  if (!order) return null;

  return {
    id: String(order._id),
    reference: `#${String(order._id).slice(-6).toUpperCase()}`,
    status: order.status,
    room: order.studentSnapshot?.roomNumber || null,
    items: order.items || [],
    total: order.totalAmount,
    orderedAt: order.orderedAt,
    deliverBy: order.deliverBy,
    packedAt: order.packedAt || null,
    dispatchedAt: order.dispatchedAt || null,
    deliveredAt: order.deliveredAt || null,
    collectedAt: order.collectedAt || null,
    cancelledAt: order.cancelledAt || null,
    note: order.deliveryNote || '',
    // Who took the package at the hostel door. A name only — the storeroom is
    // asked for one and the server refuses anything more.
    receivedBy: order.proofOfDelivery?.receiverName || null,
  };
};

/* The fields fulfillmentDetail reads, and no more: a ledger that fetched whole
   order documents would carry the transition trail and the operational notes
   into a response with no use for them. */
export const ORDER_DETAIL_FIELDS =
  'transactionId items totalAmount status studentSnapshot orderedAt deliverBy ' +
  'packedAt dispatchedAt deliveredAt collectedAt cancelledAt deliveryNote proofOfDelivery';

export const buildStudentLedger = async (studentId, { staffView = false } = {}) => {
  const [refunds, topups, charges, failedTopups, student] = await Promise.all([
    WalletReversal.find({ studentId: studentId })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
    // Every top-up — the desk's and UPI's — wrote a WalletAdjustment row,
    // so the ledger is the one source here. The embedded rechargeHistory
    // the desk also writes is a duplicate of its ADMIN rows and stays out;
    // only ledger rows carry an adjustmentId a receipt can be fetched by.
    WalletAdjustment.find({ studentId: studentId })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
    // Every order the parent's money paid for — the wallet's outgoings and
    // the UPI-funded ones alike. The two are kept distinct downstream: a
    // UPI-funded charge never touched the wallet, so its row carries the
    // gateway's reference instead of balances.
    Transaction.find({
      studentId: studentId,
    })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
    // Top-up attempts the bank refused. FAILED only, deliberately: every
    // abandoned checkout eventually EXPIREs through the reconcile sweep,
    // and a history of non-events would bury the ledger. FAILED means the
    // parent completed the attempt and the money bounced.
    PaymentIntent.find({
      studentId: studentId,
      purpose: 'TOPUP',
      status: 'FAILED',
    })
      .select('amountPaise merchantOrderId createdAt')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
    // The admission number a receipt number is built around.
    Student.findById(studentId).select('admissionNumber').lean(),
  ]);

  /* The gateway's reference for each UPI-funded top-up. It sits alongside
   * the receipt number rather than instead of it: the two answer different
   * questions, and a parent chasing a payment is usually asked for whichever
   * one they do not have to hand. Desk top-ups touched no gateway, so theirs
   * is null and the app leaves the row out. */
  const upiIntentIds = topups
    .filter((entry) => entry.source === 'PARENT_UPI' && entry.paymentIntentId)
    .map((entry) => entry.paymentIntentId);
  const upiIntents = upiIntentIds.length
    ? await PaymentIntent.find({ _id: { $in: upiIntentIds } })
        .select('merchantOrderId utr upiApp')
        .lean()
    : [];
  const intentById = new Map(upiIntents.map((intent) => [String(intent._id), intent]));
  const orderIdByIntent = new Map(
    upiIntents.map((intent) => [String(intent._id), intent.merchantOrderId])
  );

  /* The number a parent quotes at the office, on every top-up row — desk
   * and UPI alike. Minting here rather than only when a receipt is opened
   * is what lets the list show one at all, and it is the same idempotent
   * call the receipt routes make: after the first read there is nothing
   * left unnumbered, so it costs one indexed query that finds nothing.
   *
   * It also improves the numbering. ensureReceiptNumbers walks a student's
   * unnumbered rows oldest first, so numbering them from the list — which
   * is where a parent lands before opening any single receipt — is what
   * keeps the per-student sequence following recharge date.
   *
   * Best-effort on purpose: a counter that will not answer must not cost a
   * parent their whole activity history. Those rows list without a number
   * and get one on the next read. */
  const unnumbered =
    topups.some((entry) => !entry.receiptNumber) ||
    charges.some(
      (entry) => entry.sourceType === 'UPI_ORDER_PAYMENT' && !entry.receiptNumber
    ) ||
    refunds.some((entry) => !entry.receiptNumber);
  let assigned = new Map();
  if (unnumbered && student?.admissionNumber) {
    try {
      assigned = await ensureReceiptNumbers(studentId, student.admissionNumber);
    } catch (error) {
      console.warn(`Could not number receipts for student ${studentId}: ${error.message}`);
    }
  }

  // The order each charge paid for, so the ledger line can name it the way
  // the orders tab does.
  const chargeById = new Map(charges.map((charge) => [String(charge._id), charge]));
  const reversedGatewayRefs = staffView
    ? refunds
        .map((refund) => chargeById.get(String(refund.transactionId)))
        .filter((charge) => charge?.sourceType === 'UPI_ORDER_PAYMENT' && charge.idempotencyKey)
        .map((charge) => charge.idempotencyKey)
    : [];
  const reversedIntents = reversedGatewayRefs.length
    ? await PaymentIntent.find({ merchantOrderId: { $in: reversedGatewayRefs } })
        .select('merchantOrderId utr')
        .lean()
    : [];
  const utrByMerchantOrderId = new Map(
    reversedIntents.map((intent) => [intent.merchantOrderId, intent.utr || null])
  );

  const refundedOrderIds = staffView
    ? refunds.map((refund) => refund.fulfillmentOrderId).filter(Boolean)
    : [];
  const orderQuery = [
    ...(charges.length ? [{ transactionId: { $in: charges.map((charge) => charge._id) } }] : []),
    ...(refundedOrderIds.length ? [{ _id: { $in: refundedOrderIds } }] : []),
  ];
  const orders = orderQuery.length
    ? await FulfillmentOrder.find(orderQuery.length === 1 ? orderQuery[0] : { $or: orderQuery })
        .select(staffView ? ORDER_DETAIL_FIELDS : 'transactionId')
        .lean()
    : [];
  const orderIdByTransaction = new Map(
    orders.map((order) => [String(order.transactionId), String(order._id)])
  );
  const orderById = new Map(orders.map((order) => [String(order._id), order]));
  const orderByTransaction = new Map(
    orders.map((order) => [String(order.transactionId), order])
  );
  const refundedTransactionIds = new Set(
    refunds.map((refund) => String(refund.transactionId))
  );

  const all = [
    ...topups.map((entry) => ({
      _id: entry._id,
      kind: 'TOP_UP',
      // The handle the receipt routes take, and how the money arrived —
      // the app's ledger row offers a receipt only when it has both.
      adjustmentId: entry._id,
      mode: entry.source === 'PARENT_UPI' ? 'UPI' : 'CASH',
      amount: entry.amount,
      previousBalance: entry.previousBalance,
      newBalance: entry.newBalance,
      date: entry.createdAt,
      // Both references, because they are asked for by different people:
      // the office quotes the receipt number, gateway support quotes theirs.
      receiptNumber: entry.receiptNumber || assigned.get(String(entry._id)) || null,
      transactionId: entry.paymentIntentId
        ? orderIdByIntent.get(String(entry.paymentIntentId)) || null
        : null,
      ...(staffView
        ? {
            utr: intentById.get(String(entry.paymentIntentId))?.utr || null,
            upiApp: intentById.get(String(entry.paymentIntentId))?.upiApp || null,
          }
        : {}),
    })),
    // No balances on a failed attempt: the money never moved, so there is
    // no before and after to show — only what was tried, when, and the
    // reference to chase it by.
    ...failedTopups.map((entry) => ({
      _id: entry._id,
      kind: 'TOPUP_FAILED',
      amount: paiseToRupees(entry.amountPaise),
      transactionId: entry.merchantOrderId,
      date: entry.createdAt,
    })),
    ...refunds.map((entry) => ({
      _id: entry._id,
      kind: 'ORDER_CANCELLATION_REFUND',
      amount: entry.amount,
      previousBalance: entry.previousBalance,
      newBalance: entry.newBalance,
      date: entry.createdAt,
      reason: entry.reason,
      // Numbered from the same per-student series as every other receipt, so
      // a family holding one number is holding a number the office can find.
      receiptNumber: entry.receiptNumber || assigned.get(String(entry._id)) || null,
      ...(staffView
        ? (() => {
            const order = fulfillmentDetail(orderById.get(String(entry.fulfillmentOrderId)));
            return {
              order,
              // The order it belongs to, and the charge it gave back — the two
              // handles anyone asking about a refund has to hand.
              orderId: order?.reference || null,
              // What the receipt route opens for this row, as adjustmentId is
              // for a deposit.
              reversalId: String(entry._id),
              transactionId: String(entry._id),
              reversedTransactionId: entry.transactionId ? String(entry.transactionId) : null,
              utr:
                utrByMerchantOrderId.get(
                  chargeById.get(String(entry.transactionId))?.idempotencyKey
                ) || null,
            };
          })()
        : {}),
    })),
    ...charges.map((entry) => {
      const orderId = orderIdByTransaction.get(String(entry._id));
      const upiFunded = entry.sourceType === 'UPI_ORDER_PAYMENT';
      return {
        _id: entry._id,
        kind: upiFunded ? 'UPI_ORDER_PAYMENT' : 'ORDER_PAYMENT',
        amount: entry.totalAmount,
        // A UPI-funded charge moved gateway money, not wallet money: its
        // balance snapshots are equal, and printing one would read as the
        // wallet paying. It carries the gateway's reference instead —
        // chargeCart keys these charges by the paying intent's
        // merchantOrderId, the same string gateway support quotes. A
        // wallet-funded charge has no gateway, so its own ledger row's id
        // is the reference the office looks it up by.
        ...(upiFunded
          ? {
              transactionId: entry.idempotencyKey || null,
              // The school's own receipt number beside the gateway's
              // reference, exactly as a UPI top-up carries both: this money
              // entered the school directly and was receipted on the way in.
              receiptNumber:
                entry.receiptNumber || assigned.get(String(entry._id)) || null,
            }
          : {
              previousBalance: entry.previousBalance,
              newBalance: entry.remainingBalance,
              transactionId: String(entry._id),
            }),
        date: entry.createdAt,
        // The order it paid, named the way the orders tab names it. A bare
        // reference rather than a "reason" — what a charge is for is not a
        // note anyone wrote, unlike a refund's.
        orderId: orderId ? `#${orderId.slice(-6).toUpperCase()}` : null,
        ...(staffView
          ? (() => {
              const order = fulfillmentDetail(orderByTransaction.get(String(entry._id)));
              return {
                items: entry.items?.length ? entry.items : order?.items || [],
                order,
                refunded: refundedTransactionIds.has(String(entry._id)),
              };
            })()
          : {}),
      };
    }),
  ].sort((left, right) => new Date(right.date) - new Date(left.date));
  return all;
};
