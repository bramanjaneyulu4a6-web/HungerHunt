import Admin from '../../../../models/Admin.js';
import FulfillmentOrder from '../../../../models/FulfillmentOrder.js';
import Transaction from '../../../../models/Transaction.js';
import WalletAdjustment from '../../../../models/WalletAdjustment.js';
import WalletReversal from '../../../../models/WalletReversal.js';
import { collectionFilters, parseIncluded } from '../../../application/accounting/movementTypes.js';
import { buildMovementRows, movementTotals } from '../../../application/accounting/movementRows.js';
import { buildTallyCsv } from '../../../application/accounting/tallyCsv.js';
import { buildTallyVoucherXml } from '../../../application/accounting/tallyXml.js';
import { ApplicationError } from '../../../shared/errors/applicationError.js';
import { parseBusinessDateRange } from '../../../shared/http/businessDateRange.js';

const MAX_RANGE_DAYS = 93;
const MAX_VOUCHERS = 50_000;

/* Whose books these receipts belong to, printed on every line. A constant
   rather than a lookup because the school is the only party there is, and
   overridable because the account number on it will outlive this code. */
const paidTo = () =>
  process.env.TALLY_PAID_TO?.trim() || 'GRAARR BOOKS 756705002080';

/* How the storeroom and the family both name a package: the last six of its
   id. The same rule as utils/studentLedger.js — a second spelling would mean
   an accountant's query and a caretaker's search finding different things. */
const orderReference = (orderId) =>
  orderId ? `#${String(orderId).slice(-6).toUpperCase()}` : null;

// The fields the CSV reads off a student, and no more.
const STUDENT_FIELDS = 'name admissionNumber className section grade';

const ledgers = () => ({
  walletLiability: process.env.TALLY_WALLET_LEDGER?.trim() || 'Student Wallet Liability',
  sales: process.env.TALLY_SALES_LEDGER?.trim() || 'HungerHunt Sales',
  fundingClearing: process.env.TALLY_FUNDING_LEDGER?.trim() || 'Wallet Funding Clearing',
  salesVoucherType: process.env.TALLY_SALES_VOUCHER_TYPE?.trim() || 'Sales',
  receiptVoucherType: process.env.TALLY_RECEIPT_VOUCHER_TYPE?.trim() || 'Receipt',
  refundVoucherType: process.env.TALLY_REFUND_VOUCHER_TYPE?.trim() || 'Credit Note',
});

/* The period and the selection, read from one request.
 *
 * Both exports fetch the same three collections over the same range and differ
 * only in which fields they need, so the reading lives here once. A collection
 * the request did not select is not queried at all — on a full month that is
 * the difference between three scans and one — and both exports therefore
 * honour a selection identically, which is what lets an accountant reconcile
 * the CSV against the XML.
 *
 * The selection is parsed before anything is read, so a request naming a type
 * that does not exist costs a validation error rather than three queries. */
const readMovements = async (req, { select, withStudents = false }) => {
  const { from, to, timeZone } = parseBusinessDateRange(req.query, { maxDays: MAX_RANGE_DAYS });
  const filters = collectionFilters(parseIncluded(req.query.include));
  const range = { createdAt: { $gte: from, $lt: to } };

  const read = (Model, filter, fields) => {
    if (!filter) return [];
    const cursor = Model.find({ ...range, ...filter }).select(fields);
    return (withStudents ? cursor.populate('studentId', STUDENT_FIELDS) : cursor)
      .sort({ createdAt: 1 })
      .limit(MAX_VOUCHERS + 1)
      .lean();
  };

  const [transactions, adjustments, reversals] = await Promise.all([
    read(Transaction, filters.transactions, select.transactions),
    read(WalletAdjustment, filters.adjustments, select.adjustments),
    read(WalletReversal, filters.reversals, select.reversals),
  ]);

  const rowCount = transactions.length + adjustments.length + reversals.length;
  if (rowCount > MAX_VOUCHERS) {
    throw new ApplicationError(
      'Export contains more than 50,000 rows. Select a shorter period or fewer types.',
      { status: 413, code: 'EXPORT_TOO_LARGE' }
    );
  }

  return { transactions, adjustments, reversals, rowCount, timeZone, from, to };
};

export const tallyXml = async (req, res) => {
  const { transactions, adjustments, reversals, rowCount, timeZone } = await readMovements(req, {
    select: {
      transactions: '_id studentId totalAmount createdAt',
      adjustments: '_id studentId amount createdAt',
      reversals: '_id studentId amount createdAt',
    },
  });
  const xml = buildTallyVoucherXml({
    transactions, adjustments, reversals, ledgers: ledgers(), timeZone,
  });
  const filename = `hungerhunt-tally-${req.query.from.slice(0, 10)}-to-${req.query.to.slice(0, 10)}.xml`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-HungerHunt-Voucher-Count', String(rowCount));
  res.send(xml);
};

/* The same movements as the XML above, flattened into the spreadsheet the
 * office already keeps its uniform receipts in.
 *
 * Failed top-up attempts are deliberately absent: the ledger records them
 * because a parent asks about them, but no money moved and a book that lists
 * non-events will not reconcile to the bank.
 */
export const tallyCsv = async (req, res) => {
  const { transactions, adjustments, reversals, rowCount, timeZone } = await readMovements(req, {
    withStudents: true,
    select: {
      transactions: '_id studentId totalAmount sourceType receiptNumber createdAt',
      adjustments: '_id studentId source amount receiptNumber createdAt',
      reversals: '_id studentId amount receiptNumber fulfillmentOrderId createdAt',
    },
  });

  /* One read for every charge's package. A reversal needs none — it already
     carries the order it cancelled, and the reference is derived from that id
     rather than fetched again. */
  const orders = transactions.length
    ? await FulfillmentOrder.find({ transactionId: { $in: transactions.map((row) => row._id) } })
        .select('_id transactionId')
        .lean()
    : [];
  const orderByTransaction = new Map(
    orders.map((order) => [String(order.transactionId), order._id])
  );

  const csv = buildTallyCsv({
    transactions: transactions.map((row) => ({
      ...row,
      orderReference: orderReference(orderByTransaction.get(String(row._id))),
    })),
    adjustments,
    reversals: reversals.map((row) => ({
      ...row,
      orderReference: orderReference(row.fulfillmentOrderId),
    })),
    paidTo: paidTo(),
    timeZone,
  });

  const filename = `hungerhunt-tally-${req.query.from.slice(0, 10)}-to-${req.query.to.slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-HungerHunt-Row-Count', String(rowCount));
  res.send(csv);
};

/* The same movements again, as the rows the Transactions page shows.
 *
 * Deliberately the reader the two exports use, with the same period rules
 * and the same selection parameter, so what the office scrolls through on
 * screen is exactly what the CSV would file for that period — the page is
 * the export, read before it is downloaded. Sorting and filtering happen in
 * the browser over the period fetched: a day is a few dozen rows, and even
 * the longest period the reader allows is bounded by MAX_VOUCHERS.
 *
 * Staff names ride along for the deposits and refunds a person performed,
 * so the column answers "who took this money" the way the dashboard feed
 * does. A charge at the kiosk or a parent's own payment names nobody. */
export const movements = async (req, res) => {
  const { transactions, adjustments, reversals, rowCount, timeZone, from, to } =
    await readMovements(req, {
      withStudents: true,
      select: {
        transactions: '_id studentId totalAmount sourceType receiptNumber remainingBalance createdAt',
        adjustments: '_id studentId source amount receiptNumber performedBy newBalance createdAt',
        reversals:
          '_id studentId amount receiptNumber fulfillmentOrderId performedBy newBalance reason createdAt',
      },
    });

  const staffIds = [
    ...new Set(
      [...adjustments, ...reversals].map((entry) => entry.performedBy).filter(Boolean).map(String)
    ),
  ];
  const [orders, staff] = await Promise.all([
    transactions.length
      ? FulfillmentOrder.find({ transactionId: { $in: transactions.map((entry) => entry._id) } })
          .select('_id transactionId')
          .lean()
      : [],
    staffIds.length ? Admin.find({ _id: { $in: staffIds } }).select('name').lean() : [],
  ]);
  const orderByTransaction = new Map(
    orders.map((order) => [String(order.transactionId), order._id])
  );
  // Former staff still took the money; their row keeps a name rather than a blank.
  const staffNames = new Map(staffIds.map((id) => [id, 'Former staff']));
  for (const admin of staff) staffNames.set(String(admin._id), admin.name);

  const rows = buildMovementRows({
    transactions: transactions.map((entry) => ({
      ...entry,
      orderReference: orderReference(orderByTransaction.get(String(entry._id))),
    })),
    adjustments,
    reversals: reversals.map((entry) => ({
      ...entry,
      orderReference: orderReference(entry.fulfillmentOrderId),
    })),
    staffNames,
  });

  res.json({
    data: rows,
    meta: {
      requestId: req.context.requestId,
      count: rowCount,
      totals: movementTotals(rows),
      range: { from, to, timeZone },
    },
  });
};
