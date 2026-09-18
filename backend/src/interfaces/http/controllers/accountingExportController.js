import Admin from '../../../../models/Admin.js';
import FulfillmentOrder from '../../../../models/FulfillmentOrder.js';
import PaymentIntent from '../../../../models/PaymentIntent.js';
import Transaction from '../../../../models/Transaction.js';
import WalletAdjustment from '../../../../models/WalletAdjustment.js';
import WalletReversal from '../../../../models/WalletReversal.js';
import { deletionView } from '../../../../models/ledgerDeletion.js';
import { deleteLedgerEntry } from '../../../../utils/ledgerDeletion.js';
import { collectionFilters, parseIncluded } from '../../../application/accounting/movementTypes.js';
import { buildMovementRows, movementTotals } from '../../../application/accounting/movementRows.js';
import { exportChargeFilter, realMovements } from '../../../application/accounting/realMovements.js';
import { narrowByProcessedBy, parseProcessedBy } from '../../../application/accounting/processedBy.js';
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
 * that does not exist costs a validation error rather than three queries.
 * `processedBy` narrows it further to the people who handled the rows — see
 * processedBy.js — and is applied last, so it only ever takes rows away.
 *
 * The Transactions page reads every row (`realOnly` false) and marks the
 * deleted and refunded ones. The two exports read only money that really
 * moved (`realOnly` true): no deleted row, since its money was moved back; no
 * failed top-up, which is never read here; and no cancelled package — see
 * realMovements.js. Reversals are never deleted and need no filter. */
const readMovements = async (req, { select, withStudents = false, realOnly = false }) => {
  const { from, to, timeZone } = parseBusinessDateRange(req.query, { maxDays: MAX_RANGE_DAYS });
  const included = parseIncluded(req.query.include);
  const processedBy = parseProcessedBy(req.query.processedBy);
  const selected = collectionFilters(included);
  const range = { createdAt: { $gte: from, $lt: to } };

  const standing = realOnly ? { deletion: null } : {};
  if (realOnly) {
    selected.transactions = exportChargeFilter(included);
    selected.reversals = null;
  }
  const filters = narrowByProcessedBy(selected, processedBy);

  const read = (Model, filter, fields) => {
    if (!filter) return [];
    const cursor = Model.find({ ...range, ...filter }).select(fields);
    return (withStudents ? cursor.populate('studentId', STUDENT_FIELDS) : cursor)
      .sort({ createdAt: 1 })
      .limit(MAX_VOUCHERS + 1)
      .lean();
  };

  let [transactions, adjustments, reversals] = await Promise.all([
    read(Transaction, filters.transactions && { ...filters.transactions, ...standing }, select.transactions),
    read(WalletAdjustment, filters.adjustments && { ...filters.adjustments, ...standing }, select.adjustments),
    read(WalletReversal, filters.reversals, select.reversals),
  ]);

  if (realOnly) {
    /* A charge counts as cancelled whenever its refund was written, so a
       package bought in this period and cancelled after it is still left out. */
    const refunded = transactions.length
      ? await WalletReversal.find({ transactionId: { $in: transactions.map((row) => row._id) } })
          .select('transactionId')
          .lean()
      : [];
    ({ transactions, adjustments } = realMovements({
      transactions,
      adjustments,
      cancelledIds: new Set(refunded.map((row) => String(row.transactionId))),
      included,
    }));
  }

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
    realOnly: true,
    select: {
      // sourceType and receiptNumber: a cancelled UPI order is filed as a deposit.
      transactions: '_id studentId totalAmount sourceType receiptNumber createdAt',
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
 * Failed top-ups, deleted rows and cancelled packages are deliberately absent:
 * the ledger records them because a parent asks about them, but no money
 * moved and a book that lists non-events will not reconcile to the bank.
 */
export const tallyCsv = async (req, res) => {
  const { transactions, adjustments, reversals, rowCount, timeZone } = await readMovements(req, {
    withStudents: true,
    realOnly: true,
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
 * and the same selection parameter. The page shows every row, though, and
 * the exports only the money that really moved: a deleted row, a refund and
 * the charge it cancelled are listed here and left out of the files. Sorting and filtering happen in
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
        transactions:
          '_id studentId totalAmount sourceType receiptNumber idempotencyKey items previousBalance remainingBalance deletion createdAt',
        adjustments:
          '_id studentId source amount receiptNumber performedBy paymentIntentId previousBalance newBalance deletion createdAt',
        reversals:
          '_id studentId amount receiptNumber fulfillmentOrderId transactionId performedBy previousBalance newBalance reason createdAt',
      },
    });

  const staffIds = [
    ...new Set(
      [...adjustments, ...reversals].map((entry) => entry.performedBy).filter(Boolean).map(String)
    ),
  ];
  /* The handles PhonePe knows a UPI row by. A parent's top-up points at its
     intent; a UPI order payment's idempotency key IS the intent's merchant
     order id (see settlePaymentIntent), so both are read from one query. */
  const intentIds = adjustments
    .filter((entry) => entry.source === 'PARENT_UPI' && entry.paymentIntentId)
    .map((entry) => entry.paymentIntentId);
  const merchantOrderIds = transactions
    .filter((entry) => entry.sourceType === 'UPI_ORDER_PAYMENT' && entry.idempotencyKey)
    .map((entry) => entry.idempotencyKey);
  const reversedIds = reversals.map((entry) => entry.transactionId).filter(Boolean);
  const walletChargeIds = transactions
    .filter((entry) => entry.sourceType !== 'UPI_ORDER_PAYMENT' && !entry.deletion)
    .map((entry) => entry._id);

  const [orders, staff, intents, reversed, refundedCharges] = await Promise.all([
    transactions.length
      ? FulfillmentOrder.find({ transactionId: { $in: transactions.map((entry) => entry._id) } })
          .select('_id transactionId')
          .lean()
      : [],
    staffIds.length ? Admin.find({ _id: { $in: staffIds } }).select('name').lean() : [],
    intentIds.length || merchantOrderIds.length
      ? PaymentIntent.find({
          $or: [
            ...(intentIds.length ? [{ _id: { $in: intentIds } }] : []),
            ...(merchantOrderIds.length ? [{ merchantOrderId: { $in: merchantOrderIds } }] : []),
          ],
        })
          .select('merchantOrderId utr upiApp')
          .lean()
      : [],
    // A refund restores a whole charge, so its basket is that charge's basket.
    reversedIds.length
      ? Transaction.find({ _id: { $in: reversedIds } }).select('items').lean()
      : [],
    /* Which of this period's wallet charges were refunded, whenever that
       happened — a refund from a later day is outside this period's reversals
       but still means the charge cannot be deleted. */
    walletChargeIds.length
      ? WalletReversal.find({ transactionId: { $in: walletChargeIds } }).select('transactionId').lean()
      : [],
  ]);
  const orderByTransaction = new Map(
    orders.map((order) => [String(order.transactionId), order._id])
  );
  // Former staff still took the money; their row keeps a name rather than a blank.
  const staffNames = new Map(staffIds.map((id) => [id, 'Former staff']));
  for (const admin of staff) staffNames.set(String(admin._id), admin.name);
  const gatewayOf = (intent) =>
    intent ? { reference: intent.merchantOrderId, utr: intent.utr, upiApp: intent.upiApp } : null;
  const intentById = new Map(intents.map((intent) => [String(intent._id), intent]));
  const intentByOrderId = new Map(intents.map((intent) => [intent.merchantOrderId, intent]));
  const itemsByTransaction = new Map(reversed.map((txn) => [String(txn._id), txn.items]));

  const rows = buildMovementRows({
    transactions: transactions.map((entry) => ({
      ...entry,
      orderReference: orderReference(orderByTransaction.get(String(entry._id))),
      gateway:
        entry.sourceType === 'UPI_ORDER_PAYMENT'
          ? gatewayOf(intentByOrderId.get(entry.idempotencyKey)) || { reference: entry.idempotencyKey }
          : null,
    })),
    adjustments: adjustments.map((entry) => ({
      ...entry,
      gateway: gatewayOf(intentById.get(String(entry.paymentIntentId))),
    })),
    reversals: reversals.map((entry) => ({
      ...entry,
      orderReference: orderReference(entry.fulfillmentOrderId),
      items: itemsByTransaction.get(String(entry.transactionId)) || [],
    })),
    staffNames,
    refundedIds: new Set(refundedCharges.map((entry) => String(entry.transactionId))),
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

/* Everyone an export can be narrowed to: each admin who ever took a deposit
 * or gave a refund, by the name they carry now. Read from the ledger rather
 * than the staff roster, so a person who has never handled money is not
 * offered, and one who has since left is still there to be asked about —
 * as "Former staff", the same name the Transactions page gives their rows. */
export const staff = async (req, res) => {
  const [deposits, refunds] = await Promise.all([
    WalletAdjustment.distinct('performedBy'),
    WalletReversal.distinct('performedBy'),
  ]);
  const ids = [...new Set([...deposits, ...refunds].filter(Boolean).map(String))];
  const admins = ids.length ? await Admin.find({ _id: { $in: ids } }).select('name').lean() : [];
  const names = new Map(admins.map((admin) => [String(admin._id), admin.name]));

  res.json({
    data: ids
      .map((id) => ({ id, name: names.get(id) || 'Former staff' }))
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    meta: { requestId: req.context.requestId },
  });
};

/* Deleting one row off the Transactions page. The row stays, marked; the
 * money moves back — see utils/ledgerDeletion.js for the rules. Any admin may
 * do it, and the deletion records which one did. */
export const deleteMovement = async (req, res) => {
  const result = await deleteLedgerEntry({
    kind: String(req.body?.kind || ''),
    id: req.params.id,
    actorId: req.staff.id,
    reason: req.body?.reason,
  });
  res.json({
    data: {
      kind: result.kind,
      id: result.id,
      balance: result.balance,
      deletion: deletionView(result.deletion),
    },
    meta: { requestId: req.context.requestId },
  });
};
