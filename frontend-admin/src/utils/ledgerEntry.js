/* The office's vocabulary for a wallet ledger entry: what a row is called,
 * which way the money went, and what to quote when someone asks about it.
 *
 * Pure — no network, no React. The calls that fetch a ledger live next door in
 * walletActivity.js. Split apart because three screens read this vocabulary
 * and it is the half that can be reasoned about, and tested, on its own.
 */
import { formatINR } from './format.js';
import { fulfillmentStatusLabel } from './fulfillmentStatus.js';

/* Money in or out, and what to call it. `direction` drives the sign and the
   colour; nothing else in this file decides either.
 *
 * The names are the parent app's, word for word — see the card labels in
 * frontend-parent/src/pages/ChildDetails.jsx. A parent reading "UPI Deposit"
 * on their phone and an admin reading "Top-up · UPI" about the same row were
 * two vocabularies for one event, and the phone call between them is where
 * that costs something. */
const ENTRY_KINDS = {
  TOP_UP: { direction: 'in', label: 'Deposit', variant: 'success' },
  ORDER_CANCELLATION_REFUND: { direction: 'in', label: 'Refund', variant: 'success' },
  ORDER_PAYMENT: { direction: 'out', label: 'Student Wallet Payment', variant: 'neutral' },
  UPI_ORDER_PAYMENT: { direction: 'out', label: 'UPI Payment', variant: 'neutral' },
  // Money that never moved. It is here because a parent sees it too, and the
  // desk being able to say "your bank refused it at 4:12" is the whole value.
  TOPUP_FAILED: { direction: 'none', label: 'Failed Transaction', variant: 'alert' },
};

/* A row the office deleted (backend utils/ledgerDeletion.js). It stays on
   every list, but its money was moved back: it is labelled as deleted, its
   amount is struck through, and no total counts it. */
export const isDeleted = (entry) => Boolean(entry?.deleted);

// One label, not the kind plus a tag: "Deleted Cash Deposit".
const asDeleted = (kind) => ({ ...kind, label: `Deleted ${kind.label}`, variant: 'alert' });

export const describeEntry = (entry) => {
  const known = ENTRY_KINDS[entry.kind] ?? { direction: 'out', label: entry.kind, variant: 'neutral' };
  // Where the money came in from is the first thing anyone asks about a deposit.
  const kind = entry.kind === 'TOP_UP'
    ? { ...known, label: entry.mode === 'UPI' ? 'UPI Deposit' : 'Cash Deposit' }
    : known;
  return isDeleted(entry) ? asDeleted(kind) : kind;
};

/* What a row adds to a day's totals: nothing once it was deleted, since its
   money went back. `direction` is 'in', 'out' or 'none'. */
export const countedDirection = (entry) =>
  isDeleted(entry) ? 'none' : describeEntry(entry).direction;

/* The two lists a wallet reads as. An order row is money leaving for a
   package; everything else — top-ups, the attempts that failed, and the
   refunds that gave an order's money back — is a transaction on the wallet
   itself. A refund is not filed under the order it undid: the order's own row
   says it was refunded, and the money's movement belongs with the money. */
export const isOrder = (entry) =>
  entry.kind === 'ORDER_PAYMENT' || entry.kind === 'UPI_ORDER_PAYMENT';

export const isTransaction = (entry) => !isOrder(entry);

/* The rows an export file lists: money that really moved, and nothing else.
 *
 * A failed top-up, a deleted row, a refund and the order it cancelled are all
 * left out — together the last two moved nothing. The exception is an order
 * paid straight over UPI: that money reached the bank and the cancellation put
 * it in the wallet, so it is listed as the UPI deposit it became. The same
 * rule as the TallyPrime exports (backend realMovements.js). */
const NOT_MONEY = new Set(['TOPUP_FAILED', 'ORDER_CANCELLATION_REFUND']);

export const exportableEntries = (entries) => entries.flatMap((entry) => {
  if (isDeleted(entry) || NOT_MONEY.has(entry.kind)) return [];
  if (!entry.refunded) return [entry];
  if (entry.kind !== 'UPI_ORDER_PAYMENT') return [];
  return [{
    ...entry, kind: 'TOP_UP', mode: 'UPI', refunded: false, items: [], order: null, orderId: null,
  }];
});

/* One reference per row, and only one.
 *
 * A deposit is quoted by its receipt number — the figure printed on the paper
 * the family holds, and the only one an admin and a parent can both read off
 * the same object. Cash deposits had no reference at all before that (the
 * column showed an em dash) and UPI deposits showed the gateway's order id,
 * which neither party can do anything with; it stays in the row's detail as
 * "Transaction ID" for the rare call to gateway support. A deposit written
 * before numbering moved to creation time carries no number until someone
 * opens its student's ledger, so the gateway reference remains the fallback.
 *
 * An order row is looked up by its order number, a transaction by its
 * transaction id. A refund is asked about by the order it belongs to, so it
 * carries that here and its own ids in the detail. Order references arrive
 * spelled "#E860AB" (the orders tab's form); the ledger column prints the
 * bare number. */
export const entryReference = (entry) => {
  const reference =
    isOrder(entry) || entry.kind === 'ORDER_CANCELLATION_REFUND'
      ? entry.orderId || entry.order?.reference || null
      : entry.receiptNumber || entry.transactionId || null;
  return reference ? String(reference).replace(/^#/, '') : null;
};

/* An order row is labelled by where the package actually is — the live status
   for one still moving, the last one for one that is finished. A refunded
   order says exactly that and nothing else: the cancellation and the money
   coming back are one event to everybody except the ledger. */
const ORDER_STATUS_VARIANTS = { CANCELLED: 'alert', COLLECTED: 'success' };

const asOrder = (state) => `Order – ${state}`;

const describeOrder = (entry) => {
  // The package may still be moving, but the money is what the row is about.
  if (isDeleted(entry)) return describeEntry(entry);
  if (entry.refunded) return { label: asOrder('Refunded'), variant: 'success' };
  const status = entry.order?.status;
  if (!status) {
    const kind = describeEntry(entry);
    return { ...kind, label: asOrder(kind.label) };
  }
  return {
    label: asOrder(fulfillmentStatusLabel(status)),
    variant: ORDER_STATUS_VARIANTS[status] || 'neutral',
  };
};

/* What a row is called wherever it is shown. */
export const entryLabel = (entry) =>
  isOrder(entry) ? describeOrder(entry) : describeEntry(entry);

/* Which hands the money moved through. The dashboard feed says so outright
   (`via`); the student ledger, built by the older shared builder, does not,
   and there a deposit's mode and a refund's kind are enough to place it while
   a purchase is left as an order rather than guessed at. */
const CHANNELS = { ADMIN_DESK: 'Admin desk', PARENT_APP: 'Parent app', KIOSK: 'Kiosk' };

const channelOf = (entry) => {
  if (entry.via) return entry.via;
  if (entry.kind === 'TOP_UP') return entry.mode === 'UPI' ? 'PARENT_APP' : 'ADMIN_DESK';
  if (entry.kind === 'ORDER_CANCELLATION_REFUND') return 'ADMIN_DESK';
  if (entry.kind === 'TOPUP_FAILED') return 'PARENT_APP';
  return null;
};

export const entryChannel = (entry) => CHANNELS[channelOf(entry)] ?? null;

/* The Processed by column. An admin's row names the admin; every other row
   names the channel in muted text, so the column never reads as missing —
   there is no person on the office's side of a parent's UPI deposit or a
   student's kiosk sale, and the row should say so rather than leave a dash. */
export const entryActor = (entry) => {
  if (entry.processedBy?.name) return { name: entry.processedBy.name, muted: false };

  const channel = channelOf(entry);
  const upi = entry.kind === 'TOP_UP' || entry.kind === 'TOPUP_FAILED' ? 'Parent via PhonePe' : 'Parent via UPI';
  const name =
    channel === 'KIOSK' ? 'Student at kiosk'
    : channel === 'ADMIN_DESK' ? 'Admin desk'
    : channel === 'PARENT_APP'
      ? (entry.kind === 'ORDER_PAYMENT' ? 'Parent approval' : upi)
      : 'Order';
  return { name, muted: true };
};

export const entryAmount = (entry) => {
  const { direction } = describeEntry(entry);
  if (direction === 'none' || isDeleted(entry)) return formatINR(entry.amount);
  return `${direction === 'in' ? '+' : '−'} ${formatINR(entry.amount)}`;
};

/* Whether a row has anything to open into. A top-up has its receipt and
   nothing more to say; a charge or a refund has a basket, a package, or both. */
export const hasDetails = (entry) =>
  Boolean(
    entry.processedBy ||
      entry.order ||
      entry.items?.length ||
      entry.receiptNumber ||
      entry.utr ||
      entry.transactionId ||
      entry.reversedTransactionId ||
      entry.reason ||
      entry.deletion
  );

/* What the delete popup (components/DeleteTransaction.jsx) needs to know
   about a ledger row. Only a cash deposit still standing can be deleted from
   a ledger; anything else answers null and gets no button. */
export const depositTarget = (entry, studentName) =>
  entry?.kind === 'TOP_UP' && entry.mode === 'CASH' && !isDeleted(entry) && entry._id
    ? {
        id: String(entry._id),
        kind: 'CASH_DEPOSIT',
        amount: entry.amount,
        receiptNumber: entry.receiptNumber || null,
        reference: null,
        studentName: studentName || entry.student?.name || '',
        madeBy: entry.processedBy?.name || null,
      }
    : null;

/* Who made a deleted row, who deleted it, when and why — the facts a deleted
   row opens into, first, because they are why anyone opens it. */
export const deletionFacts = (entry, when) =>
  entry?.deletion
    ? [
        ['Deleted by', entry.deletion.byName],
        ['Deleted on', when(entry.deletion.at)],
        ['Reason for deletion', entry.deletion.reason],
        ['Made by', entry.deletion.madeBy],
      ].filter(([, value]) => value)
    : [];

/* The ledger row a just-finished recharge opens its receipt by.
 *
 * A top-up answers with the adjustment it wrote, and the receipt route is
 * addressed by that row — not by the student, and not by the response. Shaped
 * here, rather than inline at the call site, because passing the wrong id
 * would quietly fetch some other deposit's paper.
 *
 * A replayed top-up (a repeated Idempotency-Key) answers with the deposit it
 * replayed, which is the right receipt to show. A response carrying no
 * adjustment opens nothing at all. */
export const receiptEntryFromTopUp = (response) => {
  const adjustment = response?.adjustment;
  if (!adjustment?._id) return null;
  return {
    adjustmentId: String(adjustment._id),
    receiptNumber: adjustment.receiptNumber || null,
  };
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/* Today, as the school lives it. The dashboard reads one business day at a
   time and the server filters on the same definition (backend businessTime.js)
   — an evening sale in Kolkata is still yesterday by UTC, so asking for the
   browser's UTC date would open the dashboard on a day that has not started. */
export const businessDateToday = (now = new Date()) =>
  new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/* The order a ledger row stands for, in the shape the status picker takes.
   The ledger flattens the storeroom's record (backend utils/studentLedger.js),
   so the receiver is `receivedBy` and the amount is `total`. Null for a row
   that is not an order. */
export const pickerOrderOf = (entry) => (
  isOrder(entry) && entry.order?.id
    ? {
        id: entry.order.id,
        status: entry.order.status,
        receivedBy: entry.order.receivedBy,
        totalAmount: entry.order.total,
        student: entry.student,
      }
    : null
);
