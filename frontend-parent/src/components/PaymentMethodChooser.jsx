import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatINR } from '../utils/format';
import { makeUpiReference, UPI_ID_METHOD } from '../utils/demoUpi';
import { holdBackgroundRefresh } from '../utils/paymentHold';
import UpiIdForm from './UpiIdForm';
import {
  PaymentFailedStage,
  PaymentMark,
  PaymentPendingStage,
  PaymentProcessingStage,
  PaymentSuccessStage,
  WalletMark,
} from './PaymentStage';
import { ProviderMark } from './ProviderMarks';
import { TERMINAL_STATUSES } from '../services/payments';

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

   `collectEnabled` adds the row where a parent types their own UPI ID. It is
   independent of `upiProviders` and offered in a browser as well as on a phone,
   because a collect request needs nothing installed and nothing launched: the
   money is asked for, and whichever app owns that address rings.

   The wallet is the one row backed by a real charge, so `onWallet` is awaited
   and its confirmation is the server's answer rather than a timer: it resolves
   truthy once the money has actually moved, and falsy when the caller has taken
   over to show the parent what went wrong.

   `onUpi` is told what was chosen, not which row was tapped: `{ app: 'gpay' }`
   or `{ vpa: 'name@bank' }`, matching what services/payments sends onward. */
export default function PaymentMethodChooser({
  amount,
  walletBalance,
  studentName,
  walletDisabled,
  busy,
  upiProviders = null,
  collectEnabled = false,
  demoUpi = false,
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

  // 'choose' | 'upi-id' | 'upi-paying' | 'upi-paid' | 'upi-failed'
  // | 'upi-pending' | 'wallet-paying' | 'wallet-paid'
  const [stage, setStage] = useState('choose');
  const [providerId, setProviderId] = useState(null);
  // The address as the parent typed it, so the waiting screen can name who was
  // asked. A collect sent to a mistyped address is simply never approved, and
  // showing it back is what lets them spot that rather than wait it out.
  const [payingVpa, setPayingVpa] = useState('');
  const [reference] = useState(makeUpiReference);
  /* The tile and name the stage screens show. A typed address borrows the
     UPI-ID row's colours and is named by the address itself. */
  const provider = payingVpa
    ? { ...UPI_ID_METHOD, name: payingVpa }
    : listed
      ? upiProviders.find(({ id }) => id === providerId)
      : null;
  const providerName = provider?.name;

  // Any screen past the choice keeps the stage framing…
  const staged = stage !== 'choose';
  // …but only while the money is actually moving is there no way back out:
  // during those stages neither Escape, the backdrop nor the close button can
  // leave the parent wondering whether it went through. A failed or pending
  // verdict is over — dismissing it any which way is fine, and lands on the
  // same banner the Close button does. Typing a UPI ID is not a stage in that
  // sense either: nothing has been asked for yet, so it stays as escapable as
  // the choice it followed.
  const settling =
    staged && !['upi-failed', 'upi-pending', 'upi-id'].includes(stage);

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
    if (!demoUpi || stage !== 'upi-paying') return undefined;
    const timer = window.setTimeout(() => setStage('upi-paid'), PROCESSING_MS);
    return () => window.clearTimeout(timer);
  }, [demoUpi, stage]);

  /* One path for every UPI row, whichever way the parent named where the money
     should come from. `choice` is what travels on to the gateway; the display
     state beside it is only what this sheet puts on screen while it waits. */
  const startUpi = async (choice) => {
    setStage('upi-paying');
    if (demoUpi) return;

    try {
      const result = await onUpi(choice);
      if (!aliveRef.current) return;
      if (result?.status === 'APPLIED') setStage('upi-paid');
      else if (result?.status === 'FAILED') setStage('upi-failed');
      else if (
        // The poll gave up on a payment still in flight — a real intent, not
        // one of the caller's synthetic error states, and not DEGRADED (money
        // taken, order failed), whose note lives on the card behind us.
        result &&
        !result.synthetic &&
        result.status !== 'DEGRADED' &&
        !TERMINAL_STATUSES.includes(result.status)
      ) {
        setStage('upi-pending');
      } else onClose();
    } catch {
      if (aliveRef.current) onClose();
    }
  };

  const chooseUpiApp = (option) => {
    setPayingVpa('');
    setProviderId(option.id);
    return startUpi({ app: option.id });
  };

  const payByUpiId = (vpa) => {
    setPayingVpa(vpa);
    setProviderId(null);
    return startUpi({ vpa });
  };

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
      else paidCallback.current({ provider: providerName, reference });
    }, SUCCESS_HOLD_MS);
    return () => window.clearTimeout(timer);
    /* The name, not the provider object: a typed address is described by an
       object built fresh each render, and depending on it would restart this
       hold on every re-render — so the confirmation would sit there and the
       caller would never be told the payment landed. */
  }, [providerName, reference, stage]);

  return createPortal(
    <div
      className="payment-choice-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy && !settling) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={`payment-choice-sheet${staged ? ' payment-choice-sheet--stage' : ''}`}
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
                    onClick={() => chooseUpiApp(option)}
                    disabled={busy}
                  >
                    <span
                      className="payment-choice-icon payment-choice-icon--provider"
                      style={{ '--provider-color': option.color, '--provider-tint': option.tint }}
                      aria-hidden="true"
                    >
                      <ProviderMark provider={option} />
                    </span>
                    <span>
                      <strong>{option.name}</strong>
                      <small>Pay by UPI</small>
                    </span>
                  </button>
                ))
              ) : (
                <button type="button" className="payment-choice-option" onClick={() => onUpi()} disabled={busy}>
                  <span className="payment-choice-icon payment-choice-icon--upi" aria-hidden="true">₹</span>
                  <span>
                    <strong>Pay by UPI</strong>
                    <small>PhonePe, Google Pay or Paytm</small>
                  </span>
                  <span className="payment-choice-chevron" aria-hidden="true">›</span>
                </button>
              )}

              {/* Typing an address opens a form rather than a payment, so this
                  row keeps its chevron where the app rows do not. */}
              {collectEnabled && (
                <button
                  type="button"
                  className="payment-choice-option"
                  onClick={() => setStage('upi-id')}
                  disabled={busy}
                >
                  <span
                    className="payment-choice-icon payment-choice-icon--provider"
                    style={{ '--provider-color': UPI_ID_METHOD.color, '--provider-tint': UPI_ID_METHOD.tint }}
                    aria-hidden="true"
                  >
                    {UPI_ID_METHOD.mark}
                  </span>
                  <span>
                    <strong>Pay using UPI ID</strong>
                    <small>Enter your own UPI ID</small>
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

        {stage === 'upi-id' && (
          <>
            <header className="payment-choice-header">
              <div>
                <span className="payment-choice-eyebrow">Pay using UPI ID</span>
                <h2 id="payment-choice-title">Enter your UPI ID</h2>
                <p>We&apos;ll ask for {formatINR(amount)} from this UPI ID.</p>
              </div>
              <button type="button" className="upi-demo-close" onClick={onClose} disabled={busy} aria-label="Close payment options">
                ×
              </button>
            </header>

            <UpiIdForm
              amount={amount}
              busy={busy}
              onBack={() => setStage('choose')}
              onSubmit={payByUpiId}
            />
          </>
        )}

        {stage === 'upi-paying' && (
          <PaymentProcessingStage
            mark={<PaymentMark color={provider.color} tint={provider.tint}><ProviderMark provider={provider} /></PaymentMark>}
            /* A collect is the opposite of an intent: nothing opens here, the
               parent's own app is the one that has to act. Saying "Opening
               ashok@okhdfcbank…" would have them waiting on a screen that is
               never going to change by itself. */
            title={payingVpa ? `Request sent to ${payingVpa}` : `Opening ${provider.name}…`}
            message={payingVpa
              ? 'Open your UPI app and approve the payment request. This can take a minute.'
              : 'Waiting for confirmation from your UPI app. Please wait.'}
            amount={amount}
            titleId="payment-choice-title"
          />
        )}

        {stage === 'upi-paid' && (
          <PaymentSuccessStage
            title="Payment confirmed"
            message={`Your order payment of ${formatINR(amount)} was completed with ${provider.name}.`}
            receipt={demoUpi
              ? { label: 'UPI reference number', value: reference }
              : { label: 'Payment status', value: 'Confirmed by bank' }}
            titleId="payment-choice-title"
          />
        )}

        {stage === 'upi-failed' && (
          <PaymentFailedStage
            message={`Your order payment of ${formatINR(amount)} did not go through. Nothing was charged. You can try again.`}
            titleId="payment-choice-title"
            onDone={onClose}
          />
        )}

        {stage === 'upi-pending' && (
          <PaymentPendingStage
            title="Still checking"
            /* For a collect, the usual reason we are still waiting is that
               nobody has approved it yet — and the request is still sitting
               in the parent's app, so saying so is actionable rather than
               merely reassuring. */
            message={payingVpa
              ? `The request to ${payingVpa} has not been approved yet. It is still waiting in your UPI app, and the school's system will confirm the payment on its own once you approve it.`
              : "Your payment is still being processed. It's safe — the school's system will finish confirming it even if you close this page. Check back in a few minutes."}
            titleId="payment-choice-title"
            onDone={onClose}
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
