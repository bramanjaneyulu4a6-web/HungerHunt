/* The office's vocabulary for a wallet ledger entry, and the two calls that
 * fetch one. Components live in components/WalletActivity.jsx; this is what
 * they and the dashboard both read, so a top-up is described the same way
 * wherever it is shown.
 */
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import api from './api';
import { formatINR } from './format';
import { fulfillmentStatusLabel } from './fulfillmentStatus';

/* Money in or out, and what to call it. `direction` drives the sign and the
   colour; nothing else in this file decides either.
 *
 * The names are the parent app's, word for word — see the card labels in
 * frontend-parent/src/pages/ChildDetails.jsx. A parent reading "UPI Deposit"
 * on their phone and an admin reading "Top-up · UPI" about the same row were
 * two vocabularies for one event, and the phone call between them is where
 * that costs something. */
export const ENTRY_KINDS = {
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

/* One reference per row, and only one: an order row is looked up by its order
   number, a transaction by its transaction id. A refund is asked about by the
   order it belongs to, so it carries that here and its own ids in the detail.
   Order references arrive spelled "#E860AB" (the orders tab's form); the
   ledger column prints the bare number. */
export const entryReference = (entry) => {
  const reference =
    isOrder(entry) || entry.kind === 'ORDER_CANCELLATION_REFUND'
      ? entry.orderId || entry.order?.reference || null
      : entry.transactionId || null;
  return reference ? String(reference).replace(/^#/, '') : null;
};

/* An order row is labelled by where the package actually is — the live status
   for one still moving, the last one for one that is finished. A refunded
   order says exactly that and nothing else: the cancellation and the money
   coming back are one event to everybody except the ledger. */
const ORDER_STATUS_VARIANTS = { CANCELLED: 'alert', COLLECTED: 'success' };

export const describeOrder = (entry) => {
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

/* The receipt, fetched for the in-page viewer (components/ReceiptButton.jsx).
 *
 * The route needs the console's token, so the popup cannot simply iframe the
 * URL: the PDF is fetched with the token, turned into a blob, and the blob
 * URL handed back. The caller owns that URL and revokes it when its popup
 * closes. The filename comes from the response — the receipt number is
 * assigned lazily on the server, so the row may not know it yet. */
export const fetchReceipt = async (studentId, entry) => {
  try {
    const response = await api.get(
      // A deposit is opened by its adjustment, a refund by its reversal; the
      // route takes either and answers with the document that row deserves.
      `/students/${studentId}/receipts/${entry.adjustmentId || entry.reversalId}/pdf`,
      { responseType: 'blob' }
    );
    const named = /filename="?([^";]+)"?/i.exec(
      response.headers['content-disposition'] || ''
    );
    return {
      url: URL.createObjectURL(response.data),
      fileName: named?.[1] || `${entry.receiptNumber || 'receipt'}.pdf`,
    };
  } catch (error) {
    console.error(error);
    toast.error('Could not open that receipt');
    return null;
  }
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

const PAGE = 50;

/* One student's ledger, a page at a time. Kept as a hook because both modals
   need it and a parent's modal needs several at once. */
export const useStudentLedger = (studentId) => {
  const [entries, setEntries] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (wanted) => {
    if (!studentId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/students/${studentId}/ledger`, {
        params: { page: wanted, limit: PAGE },
      });
      setEntries((current) => (wanted === 1 ? data.entries : [...current, ...data.entries]));
      setHasMore(data.hasMore);
      setPage(wanted);
      setFailed(false);
    } catch (error) {
      console.error(error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    const first = window.setTimeout(() => load(1), 0);
    return () => window.clearTimeout(first);
  }, [load]);

  return { entries, hasMore, loading, failed, loadMore: () => load(page + 1), retry: () => load(1) };
};
