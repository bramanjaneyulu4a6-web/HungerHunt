import { useEffect, useState } from 'react';
import { Banner, Skeleton } from './ui';
import Icon from './Icon';
import WalletDialog from './WalletDialog';
import { fetchReceipt, isShareCancel, saveReceiptPdf } from '../services/receipts';
import { formatINR } from '../utils/format';

/* One recharge, shown the way the office would hand it over the desk: the
   company letterhead, then the facts of the payment. The server composes
   everything — this view and the downloadable PDF read the same data, so the
   receipt a parent screenshots and the one they share never disagree. */

const formatReceiptDate = (value) =>
  new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const Row = ({ label, children }) => (
  <div className="receipt-row">
    <span>{label}</span>
    <span>{children}</span>
  </div>
);

export default function ReceiptDialog({ adjustmentId, onClose }) {
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState('');

  useEffect(() => {
    let alive = true;

    fetchReceipt(adjustmentId)
      .then((data) => {
        if (alive) setReceipt(data);
      })
      .catch((err) => {
        if (alive) {
          setError(
            err.response?.data?.message ||
              'Could not load the receipt. Check your connection and try again.'
          );
        }
      });

    return () => {
      alive = false;
    };
  }, [adjustmentId]);

  // The one PDF action, behind the header's download icon: the share sheet
  // on a phone, a plain download in a browser.
  const downloadPdf = async () => {
    setShareError('');
    setSharing(true);
    try {
      await saveReceiptPdf(adjustmentId, receipt?.receiptNumber);
    } catch (err) {
      // Closing the share sheet is a decision, not a failure to report.
      if (!isShareCancel(err)) {
        setShareError('Could not prepare the PDF. Please try again.');
      }
    } finally {
      setSharing(false);
    }
  };

  const company = receipt?.company;

  return (
    <WalletDialog
      eyebrow="Wallet"
      title="Payment receipt"
      busy={Boolean(sharing)}
      onClose={onClose}
      actions={
        receipt && (
          <button
            type="button"
            className="review-modal__close"
            onClick={downloadPdf}
            disabled={Boolean(sharing)}
            aria-label="Download receipt PDF"
          >
            <Icon name="download" size={20} />
          </button>
        )
      }
    >
      {error && (
        <Banner variant="alert" icon="⚠️" style={{ marginBottom: 20 }}>
          {error}
        </Banner>
      )}

      {!error && !receipt && (
        <>
          <Skeleton width="70%" height={18} />
          <Skeleton width="50%" height={14} style={{ marginTop: 12 }} />
          <Skeleton height={120} style={{ marginTop: 20 }} />
        </>
      )}

      {receipt && (
        <>
          <div className="receipt-sheet">
            <header className="receipt-letterhead">
              <strong>{company.name}</strong>
              {company.address && <span className="receipt-address">{company.address}</span>}
              {(company.cin || company.gstin) && (
                <span>
                  {[
                    company.cin && `CIN: ${company.cin}`,
                    company.gstin && `GSTIN: ${company.gstin}`,
                  ]
                    .filter(Boolean)
                    .join('  ·  ')}
                </span>
              )}
              {(company.phone || company.email) && (
                <span>{[company.phone, company.email].filter(Boolean).join('  ·  ')}</span>
              )}
            </header>

            <h3 className="receipt-title">Wallet Recharge Receipt</h3>

            <div className="receipt-marks">
              <span className="receipt-marks__note">Note :- Currency is in Rs.</span>
              <span>Parent Copy</span>
            </div>

            <Row label="Receipt No.">{receipt.receiptNumber}</Row>
            <Row label="Date">{formatReceiptDate(receipt.date)}</Row>
            <Row label="Admission No.">{receipt.student.admissionNumber}</Row>
            <Row label="Student's Name">{receipt.student.name}</Row>
            <Row label="Parent's Name">
              {receipt.parent.name
                ? `${receipt.parent.name} (${receipt.parent.phone})`
                : receipt.parent.phone}
            </Row>
            <Row label="Class">{receipt.student.className || '—'}</Row>
            <Row label="Section">{receipt.student.section || '—'}</Row>
            <Row label="Room">{receipt.student.roomNumber || '—'}</Row>

            <div className="receipt-amount">
              <span>Amount received</span>
              <strong>{formatINR(receipt.amount)}</strong>
              <em>{receipt.amountInWords}</em>
            </div>

            {receipt.mode === 'CASH' ? (
              <>
                <Row label="Payment Mode">Cash — at school office</Row>
                {receipt.receivedBy?.name && (
                  <Row label="Received By">{receipt.receivedBy.name}</Row>
                )}
              </>
            ) : (
              <>
                {/* The server composes this label — an app name where our own
                    picker chose one, the parent's masked UPI ID where they
                    typed one, and nothing at all where the choice happened
                    inside PhonePe's page and was never ours to see. The PDF
                    prints the same field, which is the point: this row used to
                    say "PhonePe" whatever the parent actually paid with, and
                    disagreed with the PDF beside it. */}
                <Row label="Payment Mode">
                  {receipt.payment?.upiLabel ? `UPI (${receipt.payment.upiLabel})` : 'UPI'}
                </Row>
                {receipt.payment?.merchantOrderId && (
                  <Row label="Order Ref">{receipt.payment.merchantOrderId}</Row>
                )}
                {receipt.payment?.providerOrderId && (
                  <Row label="PhonePe Ref">{receipt.payment.providerOrderId}</Row>
                )}
                {/* The bank's own reference — the one a parent can match
                    against their bank statement. */}
                {receipt.payment?.utr && (
                  <Row label="UTR">{receipt.payment.utr}</Row>
                )}
              </>
            )}
            {receipt.note && <Row label="Remarks">{receipt.note}</Row>}

            <Row label="Balance before">{formatINR(receipt.previousBalance)}</Row>
            <Row label="Balance after">{formatINR(receipt.newBalance)}</Row>

            <p className="receipt-footnote">
              <span className="receipt-footnote__policy">
                Wallet recharges are non-refundable and non-transferable
              </span>
              Computer-generated receipt; valid without a signature.
            </p>
          </div>

          {shareError && (
            <Banner variant="alert" icon="⚠️" style={{ marginTop: 16 }}>
              {shareError}
            </Banner>
          )}
        </>
      )}
    </WalletDialog>
  );
}
