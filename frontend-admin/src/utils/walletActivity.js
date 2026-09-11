/* Fetching a wallet ledger, and the state that holds an open receipt: one
 * student's receipt, the popup it fills, and the paged history three screens
 * read.
 *
 * The vocabulary those screens describe a row with — what it is called, which
 * way the money went, what to quote when someone asks about it — lives in
 * ledgerEntry.js, so a top-up is described the same way wherever it is shown.
 */
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import api from './api';

/* The receipt, fetched for the in-page viewer (components/Receipt.jsx).
 *
 * The route needs the console's token, so the popup cannot simply iframe the
 * URL: the PDF is fetched with the token, turned into a blob, and the blob
 * URL handed back. The caller owns that URL and revokes it when its popup
 * closes. The filename comes from the response — a row written before
 * numbering moved to creation time may still be waiting for its number. */
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

/* Owns the fetch and the blob URL, which lives exactly as long as the popup
   does. `receipt` is null when nothing is open; `loading` is true only while a
   fetch is in flight, so a caller can say so on whatever it was clicked from. */
export const useReceipt = () => {
  const [receipt, setReceipt] = useState(null); // { url, fileName } while open
  const [loading, setLoading] = useState(false);

  const open = async (studentId, entry) => {
    if (!studentId || !entry) return;
    setLoading(true);
    const fetched = await fetchReceipt(studentId, entry);
    // fetchReceipt reports its own failure; there is simply nothing to show.
    if (fetched) setReceipt(fetched);
    setLoading(false);
  };

  const close = () => {
    setReceipt((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  };

  return { receipt, loading, open, close };
};

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
