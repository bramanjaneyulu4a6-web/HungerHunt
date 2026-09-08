import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatINR } from '../utils/format';
import { DEMO_UPI_PROVIDERS, makeUpiReference, UPI_ID_METHOD } from '../utils/demoUpi';
import UpiIdForm from './UpiIdForm';
import {
  PaymentFailedStage,
  PaymentMark,
  PaymentPendingStage,
  PaymentProcessingStage,
  PaymentSuccessStage,
} from './PaymentStage';
import { ProviderMark } from './ProviderMarks';
import { TERMINAL_STATUSES } from '../services/payments';

const PROCESSING_MS = 1700;

/* The wallet top-up checkout: there is no earlier sheet in that flow to have
   chosen a UPI app in, so this one opens on its own picker and carries the
   payment through to its receipt. The order flow asks and confirms inside its
   own payment sheet instead — see PaymentMethodChooser. */
export default function DemoUpiCheckout({
  amount,
  studentName,
  purposeLabel = 'Wallet top-up',
  demo = true,
  /* Whether the picker offers a row for typing an address. Unlike the app
     rows it needs nothing installed, so a browser build shows it too. */
  collectEnabled = false,
  onPay,
  onClose,
  onComplete,
  /* Dismissing the failed verdict is the end of the whole attempt, not a step
     back to the sheet underneath — the caller closes that sheet here. Backing
     out of the picker, or parking a pending payment, only calls onClose: the
     parent is returning to the sheet, not leaving it. */
  onFailedClosed = null,
}) {
  const [providerId, setProviderId] = useState('gpay');
  // 'choose' | 'upi-id' | 'processing' | 'success' | 'failed' | 'pending'
  const [stage, setStage] = useState('choose');
  // The address as typed, so the waiting screen can name who was asked. Empty
  // whenever the parent picked an app instead.
  const [payingVpa, setPayingVpa] = useState('');
  const [reference] = useState(makeUpiReference);
  const closeButtonRef = useRef(null);
  const finishedRef = useRef(false);
  const chosenApp = DEMO_UPI_PROVIDERS.find(({ id }) => id === providerId);
  /* What the stage screens put on screen. A typed address borrows the UPI-ID
     row's colours and is named by the address itself. */
  const provider = payingVpa ? { ...UPI_ID_METHOD, name: payingVpa } : chosenApp;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && stage !== 'processing') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, stage]);

  useEffect(() => {
    if (!demo || stage !== 'processing') return undefined;
    const timer = window.setTimeout(() => setStage('success'), PROCESSING_MS);
    return () => window.clearTimeout(timer);
  }, [demo, stage]);

  const pay = async (choice) => {
    setStage('processing');
    if (demo) return;
    try {
      const result = await onPay(choice);
      if (result?.status === 'APPLIED') setStage('success');
      else if (result?.status === 'FAILED') setStage('failed');
      else if (
        // The poll gave up on a payment still in flight — a real intent, not
        // one of the caller's synthetic error states. Everything else closes
        // to the banner behind this sheet, which owns the nuanced verdicts.
        result &&
        !result.synthetic &&
        !TERMINAL_STATUSES.includes(result.status)
      ) {
        setStage('pending');
      } else onClose();
    } catch {
      onClose();
    }
  };

  const payWithApp = () => {
    setPayingVpa('');
    return pay({ app: providerId });
  };

  const payByUpiId = (vpa) => {
    setPayingVpa(vpa);
    return pay({ vpa });
  };

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onClose();
    onComplete({ provider: provider.name, reference });
  }, [onClose, onComplete, provider.name, reference]);

  return createPortal(
    <div className="upi-demo-overlay" role="presentation">
      <section
        className="upi-demo-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upi-demo-title"
      >
        {stage === 'choose' && (
          <>
            <header className="upi-demo-header">
              <div>
                <span className="upi-demo-badge">Secure UPI</span>
                <h2 id="upi-demo-title">Pay securely with UPI</h2>
                <p>Complete your payment using your preferred UPI app.</p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="upi-demo-close"
                onClick={onClose}
                aria-label="Close UPI checkout"
              >
                ×
              </button>
            </header>

            <div className="upi-demo-summary">
              <div>
                <span>{purposeLabel}</span>
                <strong>{studentName}</strong>
              </div>
              <strong className="upi-demo-amount">{formatINR(amount)}</strong>
            </div>

            <fieldset className="upi-demo-methods">
              <legend>Choose a UPI app</legend>
              {DEMO_UPI_PROVIDERS.map((option) => {
                const selected = providerId === option.id;
                return (
                  <label
                    key={option.id}
                    className={`upi-demo-method${selected ? ' upi-demo-method--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="demo-upi-provider"
                      value={option.id}
                      checked={selected}
                      onChange={() => setProviderId(option.id)}
                    />
                    <span
                      className="upi-demo-provider-mark"
                      style={{ '--provider-color': option.color, '--provider-tint': option.tint }}
                      aria-hidden="true"
                    >
                      <ProviderMark provider={option} />
                    </span>
                    <span className="upi-demo-provider-name">
                      <strong>{option.name}</strong>
                      <small>Pay using UPI</small>
                    </span>
                    <span className="upi-demo-radio" aria-hidden="true" />
                  </label>
                );
              })}
            </fieldset>

            {collectEnabled && (
              <button
                type="button"
                className="upi-demo-use-id"
                onClick={() => setStage('upi-id')}
              >
                <span aria-hidden="true">{UPI_ID_METHOD.mark}</span>
                Pay using your own UPI ID instead
              </button>
            )}

            <div className="upi-demo-trust">
              <span aria-hidden="true">⌁</span>
              <span>UPI payments are protected by your bank. Never share your UPI PIN.</span>
            </div>

            <button
              type="button"
              className="upi-demo-pay"
              onClick={payWithApp}
            >
              Pay {formatINR(amount)} with {chosenApp.name}
            </button>
          </>
        )}

        {stage === 'upi-id' && (
          <>
            <header className="upi-demo-header">
              <div>
                <span className="upi-demo-badge">Secure UPI</span>
                <h2 id="upi-demo-title">Enter your UPI ID</h2>
                <p>We&apos;ll ask for {formatINR(amount)} from this UPI ID.</p>
              </div>
              <button
                type="button"
                className="upi-demo-close"
                onClick={onClose}
                aria-label="Close UPI checkout"
              >
                ×
              </button>
            </header>

            <div className="upi-demo-summary">
              <div>
                <span>{purposeLabel}</span>
                <strong>{studentName}</strong>
              </div>
              <strong className="upi-demo-amount">{formatINR(amount)}</strong>
            </div>

            <UpiIdForm
              amount={amount}
              onBack={() => setStage('choose')}
              onSubmit={payByUpiId}
            />
          </>
        )}

        {stage === 'processing' && (
          <PaymentProcessingStage
            mark={<PaymentMark color={provider.color} tint={provider.tint}><ProviderMark provider={provider} /></PaymentMark>}
            /* Nothing opens for a collect — the parent's own app is the one
               that has to act, so saying "Opening ashok@okhdfcbank…" would
               leave them waiting on a screen that will not change by itself. */
            title={payingVpa ? `Request sent to ${payingVpa}` : `Opening ${provider.name}…`}
            message={payingVpa
              ? 'Open your UPI app and approve the payment request. This can take a minute.'
              : 'Waiting for confirmation from your UPI app. Please wait.'}
            amount={amount}
            titleId="upi-demo-title"
          />
        )}

        {stage === 'failed' && (
          <PaymentFailedStage
            message={`Your ${purposeLabel.toLowerCase()} of ${formatINR(amount)} did not go through. Nothing was charged. You can try again.`}
            titleId="upi-demo-title"
            onDone={() => {
              onClose();
              onFailedClosed?.();
            }}
          />
        )}

        {stage === 'pending' && (
          <PaymentPendingStage
            title="Still checking"
            /* For a collect, the usual reason is simply that nobody has
               approved it yet — and the request is still sitting in the
               parent's app, so saying so is something they can act on. */
            message={payingVpa
              ? `The request to ${payingVpa} has not been approved yet. It is still waiting in your UPI app, and the school's system will confirm the top-up on its own once you approve it.`
              : "Your payment is still being processed. It's safe — the school's system will finish confirming it even if you close this page. Check back in a few minutes."}
            titleId="upi-demo-title"
            onDone={onClose}
          />
        )}

        {stage === 'success' && (
          <PaymentSuccessStage
            title="Payment successful"
            message={`Your ${purposeLabel.toLowerCase()} of ${formatINR(amount)} was completed with ${provider.name}.`}
            receipt={demo
              ? { label: 'UPI reference number', value: reference }
              : { label: 'Payment status', value: 'Confirmed by bank' }}
            titleId="upi-demo-title"
            onDone={finish}
          />
        )}
      </section>
    </div>,
    document.body
  );
}
