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

export const describeEntry = (entry) => {
  const kind = ENTRY_KINDS[entry.kind] ?? { direction: 'out', label: entry.kind, variant: 'neutral' };
  if (entry.kind !== 'TOP_UP') return kind;
  // Where the money came in from is the first thing anyone asks about a deposit.
  return { ...kind, label: entry.mode === 'UPI' ? 'UPI Deposit' : 'Cash Deposit' };
};

/* The two lists a wallet reads as. An order row is money leaving for a
   package; everything else — top-ups, the attempts that failed, and the
   refunds that gave an order's money back — is a transaction on the wallet
   itself. A refund is not filed under the order it undid: the order's own row
   says it was refunded, and the money's movement belongs with the money. */
export const isOrder = (entry) =>
  entry.kind === 'ORDER_PAYMENT' || entry.kind === 'UPI_ORDER_PAYMENT';

export const isTransaction = (entry) => !isOrder(entry);

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

const describeOrder = (entry) => {
  if (entry.refunded) return { label: 'Refunded', variant: 'success' };
  const status = entry.order?.status;
  if (!status) return describeEntry(entry);
  return {
    label: fulfillmentStatusLabel(status),
    variant: ORDER_STATUS_VARIANTS[status] || 'neutral',
  };
};

/* What a row is called wherever it is shown. */
export const entryLabel = (entry) =>
  isOrder(entry) ? describeOrder(entry) : describeEntry(entry);

export const entryAmount = (entry) => {
  const { direction } = describeEntry(entry);
  if (direction === 'none') return formatINR(entry.amount);
  return `${direction === 'in' ? '+' : '−'} ${formatINR(entry.amount)}`;
};

/* Whether a row has anything to open into. A top-up has its receipt and
   nothing more to say; a charge or a refund has a basket, a package, or both. */
export const hasDetails = (entry) =>
  Boolean(
    entry.order ||
      entry.items?.length ||
      entry.receiptNumber ||
      entry.utr ||
      entry.transactionId ||
      entry.reversedTransactionId ||
      entry.reason
  );

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
