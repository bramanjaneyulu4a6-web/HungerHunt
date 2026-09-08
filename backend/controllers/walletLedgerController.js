/* The wallet ledger, read by staff.
 *
 * Two questions the office asks and, until now, could not: what has happened
 * on one student's wallet, and what has happened on all of them today. Both
 * are answered from the same rows the parent app shows a parent — see
 * utils/studentLedger.js for why that sharing matters.
 *
 * Nothing here writes. Every route is protectAdmin: the warehouse and the
 * caretakers have no business in a family's money, and the gate says so
 * rather than the response being thin.
 */
import PaymentIntent from '../models/PaymentIntent.js';
import Transaction from '../models/Transaction.js';
import WalletAdjustment from '../models/WalletAdjustment.js';
import FulfillmentOrder from '../models/FulfillmentOrder.js';
import WalletReversal from '../models/WalletReversal.js';
import { paiseToRupees } from '../src/domain/payments/money.js';
import { businessDateStart } from '../utils/businessTime.js';
import {
  ORDER_DETAIL_FIELDS,
  buildStudentLedger,
  fulfillmentDetail,
} from '../utils/studentLedger.js';

const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

/* How far back one request will reach into each collection. The feed is a
   day's work, not an archive: a date filter narrows it to that day, and
   without one this is the most recent activity rather than all of it. */
const FEED_DEPTH = 400;

const readPaging = (req) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || PAGE_SIZE, 1), MAX_PAGE_SIZE);
  return { page, limit, skip: (page - 1) * limit };
};

const paged = (total, page, limit) => ({
  total,
  page,
  pages: Math.ceil(total / limit) || 1,
  hasMore: page * limit < total,
});

/* One business day, as the school lives it. The dashboard's date picker hands
   over a plain YYYY-MM-DD; midnight for that day in Asia/Kolkata is not
   midnight UTC, and filtering on the wrong one moves every evening sale into
   the following day. */
const businessDay = (dateString) => {
  const start = businessDateStart(dateString);
  const [year, month, day] = dateString.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const nextString = next.toISOString().slice(0, 10);
  return { $gte: start, $lt: businessDateStart(nextString) };
};

const studentOf = (row) => {
  const student = row.studentId;
  if (!student) return null;
  return typeof student === 'object' && student.name !== undefined
    ? { id: String(student._id), name: student.name }
    : { id: String(student), name: null };
};

export const getStudentLedger = async (req, res) => {
  try {
    const { page, limit, skip } = readPaging(req);
    const all = await buildStudentLedger(req.params.id, { staffView: true });

    res.json({
      entries: all.slice(skip, skip + limit),
      ...paged(all.length, page, limit),
    });
  } catch (error) {
    console.error('❌ getStudentLedger Error:', error);
    res.status(500).json({ message: error.message });
  }
};

/* Every wallet movement in the school, merged into one list.
 *
 * Deliberately four reads rather than an aggregation across collections: the
 * four models keep their own shapes and their own indexes, and the merge is
 * cheap at the depth this feed asks for. If this ever needs the whole year it
 * wants a different design, not a bigger limit. */
export const getLedgerFeed = async (req, res) => {
  try {
    const { page, limit, skip } = readPaging(req);
    const date = String(req.query.date || '').trim();

    let range;
    if (date) {
      try {
        range = businessDay(date);
      } catch {
        return res.status(400).json({ message: 'date must be a calendar date, as YYYY-MM-DD.' });
      }
    }

    const filter = range ? { createdAt: range } : {};

    const [topups, charges, refunds, failedTopups] = await Promise.all([
      WalletAdjustment.find(filter)
        .populate('studentId', 'name admissionNumber roomNumber')
        .sort({ createdAt: -1 })
        .limit(FEED_DEPTH)
        .lean(),
      Transaction.find(filter)
        .populate('studentId', 'name admissionNumber roomNumber')
        .sort({ createdAt: -1 })
        .limit(FEED_DEPTH)
        .lean(),
      WalletReversal.find(filter)
        .populate('studentId', 'name admissionNumber roomNumber')
        .sort({ createdAt: -1 })
        .limit(FEED_DEPTH)
        .lean(),
      PaymentIntent.find({ ...filter, purpose: 'TOPUP', status: 'FAILED' })
        .populate('studentId', 'name admissionNumber roomNumber')
        .sort({ createdAt: -1 })
        .limit(FEED_DEPTH)
        .lean(),
    ]);

    /* The packages behind this page of charges and refunds. One extra read for
       the whole page rather than one per row opened, because a feed is scanned
       by opening several rows in a row. */
    const orderQuery = [
      ...(charges.length ? [{ transactionId: { $in: charges.map((charge) => charge._id) } }] : []),
      ...(refunds.length
        ? [{ _id: { $in: refunds.map((refund) => refund.fulfillmentOrderId).filter(Boolean) } }]
        : []),
    ];
    const orders = orderQuery.length
      ? await FulfillmentOrder.find(orderQuery.length === 1 ? orderQuery[0] : { $or: orderQuery })
          .select(ORDER_DETAIL_FIELDS)
          .lean()
      : [];
    /* The gateway handles for this page of top-ups. The feed shows a
       transaction by its transaction id, and for a parent's UPI payment that
       is the gateway's order reference — which lives on the intent, not on the
       wallet row it credited. */
    const intentIds = topups
      .filter((entry) => entry.source === 'PARENT_UPI' && entry.paymentIntentId)
      .map((entry) => entry.paymentIntentId);
    const intents = intentIds.length
      ? await PaymentIntent.find({ _id: { $in: intentIds } })
          .select('merchantOrderId utr upiApp')
          .lean()
      : [];
    const intentById = new Map(intents.map((intent) => [String(intent._id), intent]));

    const orderById = new Map(orders.map((order) => [String(order._id), order]));
    const refundedTransactionIds = new Set(
      refunds.map((refund) => String(refund.transactionId))
    );

    /* The settlement reference a refund gave back. A cancellation moves no
       money through the gateway, so what it can name is the UTR the money
       arrived on — and only where the order was paid by UPI directly. The
       charges it reverses may be older than this page, so they are fetched by
       id rather than looked for among the rows above. */
    const reversedCharges = refunds.length
      ? await Transaction.find({
          _id: { $in: refunds.map((refund) => refund.transactionId).filter(Boolean) },
          sourceType: 'UPI_ORDER_PAYMENT',
        })
          .select('idempotencyKey')
          .lean()
      : [];
    const gatewayRefByCharge = new Map(
      reversedCharges.map((row) => [String(row._id), row.idempotencyKey])
    );
    const reversedIntents = reversedCharges.length
      ? await PaymentIntent.find({
          merchantOrderId: { $in: reversedCharges.map((row) => row.idempotencyKey).filter(Boolean) },
        })
          .select('merchantOrderId utr')
          .lean()
      : [];
    const utrByGatewayRef = new Map(
      reversedIntents.map((intent) => [intent.merchantOrderId, intent.utr || null])
    );
    const orderByTransaction = new Map(
      orders.map((order) => [String(order.transactionId), order])
    );

    const all = [
      ...topups.map((entry) => ({
        _id: entry._id,
        kind: 'TOP_UP',
        adjustmentId: entry._id,
        mode: entry.source === 'PARENT_UPI' ? 'UPI' : 'CASH',
        amount: entry.amount,
        previousBalance: entry.previousBalance,
        newBalance: entry.newBalance,
        date: entry.createdAt,
        receiptNumber: entry.receiptNumber || null,
        transactionId: intentById.get(String(entry.paymentIntentId))?.merchantOrderId || null,
        utr: intentById.get(String(entry.paymentIntentId))?.utr || null,
        upiApp: intentById.get(String(entry.paymentIntentId))?.upiApp || null,
        student: studentOf(entry),
      })),
      ...charges.map((entry) => {
        const order = fulfillmentDetail(orderByTransaction.get(String(entry._id)));
        return {
        _id: entry._id,
        kind: entry.sourceType === 'UPI_ORDER_PAYMENT' ? 'UPI_ORDER_PAYMENT' : 'ORDER_PAYMENT',
        amount: entry.totalAmount,
        ...(entry.sourceType === 'UPI_ORDER_PAYMENT'
          ? { transactionId: entry.idempotencyKey || null }
          : { previousBalance: entry.previousBalance, newBalance: entry.remainingBalance }),
        date: entry.createdAt,
        // What was bought, so the feed can open a row into its basket the way
        // it always could. Only charges have one.
        items: entry.items?.length ? entry.items : order?.items || [],
        order,
        orderId: order?.reference || null,
        refunded: refundedTransactionIds.has(String(entry._id)),
        student: studentOf(entry),
        };
      }),
      ...refunds.map((entry) => ({
        _id: entry._id,
        kind: 'ORDER_CANCELLATION_REFUND',
        amount: entry.amount,
        previousBalance: entry.previousBalance,
        newBalance: entry.newBalance,
        date: entry.createdAt,
        reason: entry.reason,
        receiptNumber: entry.receiptNumber || null,
        utr: utrByGatewayRef.get(gatewayRefByCharge.get(String(entry.transactionId))) || null,
        ...(() => {
          const order = fulfillmentDetail(orderById.get(String(entry.fulfillmentOrderId)));
          return {
            order,
            orderId: order?.reference || null,
            transactionId: String(entry._id),
            reversedTransactionId: entry.transactionId ? String(entry.transactionId) : null,
          };
        })(),
        student: studentOf(entry),
      })),
      ...failedTopups.map((entry) => ({
        _id: entry._id,
        kind: 'TOPUP_FAILED',
        amount: paiseToRupees(entry.amountPaise),
        transactionId: entry.merchantOrderId,
        date: entry.createdAt,
        student: studentOf(entry),
      })),
    ].sort((left, right) => new Date(right.date) - new Date(left.date));

    res.json({
      entries: all.slice(skip, skip + limit),
      ...paged(all.length, page, limit),
    });
  } catch (error) {
    console.error('❌ getLedgerFeed Error:', error);
    res.status(500).json({ message: error.message });
  }
};
