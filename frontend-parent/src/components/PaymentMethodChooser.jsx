import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatINR } from '../utils/format';

/* One sheet, one decision. `upiProviders` is what decides which shape this
   takes: given a list, every way of paying — each UPI app and the school
   wallet — is a row here, and choosing one is the last tap before the money
   moves. Given null, the UPI row is a doorway to the gateway's own app
   instead, so it keeps its chevron and the parent chooses their app there.

   The chevrons follow that distinction rather than decorating it: a row that
   opens something else has one, a row that commits does not. */
export default function PaymentMethodChooser({
  amount,
  walletBalance,
  studentName,
  walletDisabled,
  busy,
  upiProviders = null,
  onWallet,
  onUpi,
  onUpiProvider,
  onClose,
}) {
  const dialogRef = useRef(null);
  const listed = Array.isArray(upiProviders) && upiProviders.length > 0;

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
          {listed ? (
            upiProviders.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className="payment-choice-option"
                onClick={() => onUpiProvider(provider.id)}
                disabled={busy}
              >
                <span
                  className="payment-choice-icon payment-choice-icon--provider"
                  style={{ '--provider-color': provider.color, '--provider-tint': provider.tint }}
                  aria-hidden="true"
                >
                  {provider.mark}
                </span>
                <span>
                  <strong>{provider.name}</strong>
                  <small>Pay by UPI</small>
                </span>
              </button>
            ))
          ) : (
            <button type="button" className="payment-choice-option" onClick={onUpi} disabled={busy}>
              <span className="payment-choice-icon payment-choice-icon--upi" aria-hidden="true">₹</span>
              <span>
                <strong>Pay by UPI</strong>
                <small>PhonePe, Google Pay or Paytm</small>
              </span>
              <span className="payment-choice-chevron" aria-hidden="true">›</span>
            </button>
          )}

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
            {!listed && <span className="payment-choice-chevron" aria-hidden="true">›</span>}
          </button>
        </div>

        {walletDisabled && (
          <p className="payment-choice-note">
            {listed
              ? 'The school wallet does not have enough balance for this order. Pay with a UPI app above instead.'
              : 'The school wallet does not have enough balance for this order. Choose UPI instead.'}
          </p>
        )}
      </section>
    </div>,
    document.body
  );
}
