import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatINR } from '../utils/format';

export default function PaymentMethodChooser({
  amount,
  walletBalance,
  studentName,
  walletDisabled,
  isDemo,
  busy,
  onWallet,
  onUpi,
  onClose,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector('button')?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [busy, onClose]);

  return createPortal(
    <div
      className="payment-choice-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="payment-choice-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-choice-title"
      >
        <div className="payment-choice-handle" aria-hidden="true" />
        <header className="payment-choice-header">
          <div>
            <span className="payment-choice-eyebrow">Choose payment method</span>
            <h2 id="payment-choice-title">Accept {studentName}&apos;s order</h2>
            <p>Select how you would like to pay {formatINR(amount)}.</p>
          </div>
          <button type="button" className="upi-demo-close" onClick={onClose} disabled={busy} aria-label="Close payment options">
            ×
          </button>
        </header>

        <div className="payment-choice-options">
          <button type="button" className="payment-choice-option" onClick={onUpi} disabled={busy}>
            <span className="payment-choice-icon payment-choice-icon--upi" aria-hidden="true">₹</span>
            <span>
              <strong>Pay by UPI</strong>
              <small>PhonePe, Google Pay or Paytm</small>
            </span>
            {isDemo && <span className="upi-demo-badge">Demo</span>}
            <span className="payment-choice-chevron" aria-hidden="true">›</span>
          </button>

          <button
            type="button"
            className="payment-choice-option"
            onClick={onWallet}
            disabled={busy || walletDisabled}
          >
            <span className="payment-choice-icon payment-choice-icon--wallet" aria-hidden="true">W</span>
            <span>
              <strong>Pay through school wallet</strong>
              <small>Available balance {formatINR(walletBalance)}</small>
            </span>
            <span className="payment-choice-chevron" aria-hidden="true">›</span>
          </button>
        </div>

        {walletDisabled && (
          <p className="payment-choice-note">
            The school wallet does not have enough balance for this order. You can still preview payment by UPI.
          </p>
        )}
        {isDemo && (
          <p className="upi-demo-disclaimer">UPI is a frontend demonstration only and will not charge you.</p>
        )}
      </section>
    </div>,
    document.body
  );
}
