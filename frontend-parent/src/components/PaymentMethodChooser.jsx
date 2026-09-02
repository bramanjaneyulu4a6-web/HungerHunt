import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatINR } from '../utils/format';
import { makeUpiReference } from '../utils/demoUpi';
import { holdBackgroundRefresh } from '../utils/paymentHold';
import {
  PaymentMark,
  PaymentProcessingStage,
  PaymentSuccessStage,
  WalletMark,
} from './PaymentStage';

const PROCESSING_MS = 1700;
const SUCCESS_HOLD_MS = 2000;

/* One sheet, start to finish. Whichever row the parent picks, the payment runs
   to its confirmation inside this same sheet rather than handing over to a
   second popup — so there is one backdrop for the whole flow, and nothing
   disappears from under them between choosing and being told it worked.

   `upiProviders` is what decides the shape of the choice: given a list, every
   UPI app is a row of its own and picking one is the last tap before the money
   moves. Given null, a single UPI row is a doorway to the gateway's own app, so
   it keeps its chevron and the parent chooses their app there. The chevron
   follows that distinction rather than decorating it: a row that opens
   something else has one, a row that commits does not — which is why the
   wallet, which always commits, never carries one.

   The wallet is the one row backed by a real charge, so `onWallet` is awaited
   and its confirmation is the server's answer rather than a timer: it resolves
   truthy once the money has actually moved, and falsy when the caller has taken
   over to show the parent what went wrong. */
export default function PaymentMethodChooser({
  amount,
  walletBalance,
  studentName,
  walletDisabled,
  busy,
  upiProviders = null,
  onWallet,
  onWalletPaid,
  onUpi,
  onUpiPaid,
  onClose,
}) {
  const dialogRef = useRef(null);
  const paidRef = useRef(false);
  const aliveRef = useRef(true);
  const listed = Array.isArray(upiProviders) && upiProviders.length > 0;

  // 'choose' | 'upi-paying' | 'upi-paid' | 'wallet-paying' | 'wallet-paid'
  const [stage, setStage] = useState('choose');
  const [providerId, setProviderId] = useState(null);
  const [reference] = useState(makeUpiReference);
  const provider = listed ? upiProviders.find(({ id }) => id === providerId) : null;

  // Past the choice there is no way back out of the sheet: the money is
  // already moving, so neither Escape, the backdrop nor the close button
  // can leave the parent wondering whether it went through.
  const settling = stage !== 'choose';

  useEffect(() => {
    // React Strict Mode deliberately runs this effect's setup/cleanup twice
    // in development. Restore the guard in setup so the rehearsal cleanup
    // cannot leave the real mounted sheet permanently marked as dead.
    aliveRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // The order leaves the pending list the moment it is paid for, and the
    // page behind us would refresh it away — with this sheet inside it — as
    // soon as the parent's own "Order approved" push arrives.
    const releaseRefresh = holdBackgroundRefresh();
    dialogRef.current?.querySelector('button')?.focus();
    return () => {
      aliveRef.current = false;
      releaseRefresh();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy && !settling) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose, settling]);

  useEffect(() => {
    if (stage !== 'upi-paying') return undefined;
    const timer = window.setTimeout(() => setStage('upi-paid'), PROCESSING_MS);
    return () => window.clearTimeout(timer);
  }, [stage]);

  /* The wallet charge is the caller's to make, and it is over when the server
     says so — not after a set time. A rejected charge leaves the stage alone:
     the caller has already closed this sheet to show the parent the error. */
  const chargeWallet = () => {
    setStage('wallet-paying');
    Promise.resolve(onWallet()).then(
      (charged) => {
        if (charged && aliveRef.current) setStage('wallet-paid');
      },
      // The caller is meant to answer falsy rather than throw. If it ever does
      // throw, close rather than leave the parent watching a spinner that will
      // never resolve.
      () => aliveRef.current && onClose()
    );
  };

  /* Held in a ref so the hold below is timed from the moment the payment
     confirms, not from the last time the card behind us happened to
     re-render — an unstable callback would keep restarting the clock. */
  const paidCallback = useRef(onUpiPaid);

  useEffect(() => {
    paidCallback.current = onUpiPaid;
  }, [onUpiPaid]);

  const walletPaidCallback = useRef(onWalletPaid);

  useEffect(() => {
    walletPaidCallback.current = onWalletPaid;
  }, [onWalletPaid]);

  useEffect(() => {
    if (stage !== 'upi-paid' && stage !== 'wallet-paid') return undefined;
    const timer = window.setTimeout(() => {
      if (paidRef.current) return;
      paidRef.current = true;
      if (stage === 'wallet-paid') walletPaidCallback.current();
      else paidCallback.current({ provider: provider.name, reference });
    }, SUCCESS_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [provider, reference, stage]);

  return createPortal(
    <div
      className="payment-choice-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy && !settling) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={`payment-choice-sheet${settling ? ' payment-choice-sheet--stage' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-choice-title"
      >
        {stage === 'choose' && (
          <>
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
                upiProviders.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="payment-choice-option"
                    onClick={() => {
                      setProviderId(option.id);
                      setStage('upi-paying');
                    }}
                    disabled={busy}
                  >
                    <span
                      className="payment-choice-icon payment-choice-icon--provider"
                      style={{ '--provider-color': option.color, '--provider-tint': option.tint }}
                      aria-hidden="true"
                    >
                      {option.mark}
                    </span>
                    <span>
                      <strong>{option.name}</strong>
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
                onClick={chargeWallet}
                disabled={busy || walletDisabled}
              >
                <span className="payment-choice-icon payment-choice-icon--wallet" aria-hidden="true">W</span>
                <span>
                  <strong>Pay through school wallet</strong>
                  <small>Available balance {formatINR(walletBalance)}</small>
                </span>
              </button>
            </div>

            {walletDisabled && (
              <p className="payment-choice-note">
                {listed
                  ? 'The school wallet does not have enough balance for this order. Pay with a UPI app above instead.'
                  : 'The school wallet does not have enough balance for this order. Choose UPI instead.'}
              </p>
            )}
          </>
        )}

        {stage === 'upi-paying' && (
          <PaymentProcessingStage
            mark={<PaymentMark color={provider.color} tint={provider.tint}>{provider.mark}</PaymentMark>}
            title={`Opening ${provider.name}…`}
            message="Waiting for confirmation from your UPI app. Please wait."
            amount={amount}
            titleId="payment-choice-title"
          />
        )}

        {stage === 'upi-paid' && (
          <PaymentSuccessStage
            title="Payment confirmed"
            message={`Your order payment of ${formatINR(amount)} was completed with ${provider.name}.`}
            receipt={{ label: 'UPI reference number', value: reference }}
            titleId="payment-choice-title"
          />
        )}

        {stage === 'wallet-paying' && (
          <PaymentProcessingStage
            mark={<WalletMark />}
            title="Charging the school wallet…"
            message={`Placing ${studentName}'s order. Please wait.`}
            amount={amount}
            titleId="payment-choice-title"
          />
        )}

        {stage === 'wallet-paid' && (
          <PaymentSuccessStage
            title="Payment confirmed"
            message={`Your order payment of ${formatINR(amount)} was paid from the school wallet.`}
            receipt={{
              label: 'Remaining wallet balance',
              value: formatINR(Math.max(0, walletBalance - amount)),
            }}
            titleId="payment-choice-title"
          />
        )}
      </section>
    </div>,
    document.body
  );
}
