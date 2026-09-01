import { useEffect, useRef, useState } from 'react';
import { formatINR } from '../utils/format';
import { DEMO_UPI_PROVIDERS, makeUpiReference } from '../utils/demoUpi';

const PROCESSING_MS = 1700;

export default function DemoUpiCheckout({
  amount,
  studentName,
  purposeLabel = 'Wallet top-up',
  onClose,
  onComplete,
}) {
  const [providerId, setProviderId] = useState('gpay');
  const [stage, setStage] = useState('choose');
  const [reference] = useState(makeUpiReference);
  const closeButtonRef = useRef(null);
  const provider = DEMO_UPI_PROVIDERS.find(({ id }) => id === providerId);

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
    if (stage !== 'processing') return undefined;
    const timer = window.setTimeout(() => setStage('success'), PROCESSING_MS);
    return () => window.clearTimeout(timer);
  }, [stage]);

  const finish = () => {
    onComplete({ provider: provider.name, reference });
    onClose();
  };

  return (
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
                      {option.mark}
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

            <div className="upi-demo-trust">
              <span aria-hidden="true">⌁</span>
              <span>UPI payments are protected by your bank. Never share your UPI PIN.</span>
            </div>

            <button
              type="button"
              className="upi-demo-pay"
              onClick={() => setStage('processing')}
            >
              Pay {formatINR(amount)} with {provider.name}
            </button>
          </>
        )}

        {stage === 'processing' && (
          <div className="upi-demo-state" aria-live="polite">
            <div className="upi-demo-processing" aria-hidden="true">
              <span className="upi-demo-provider-mark" style={{ '--provider-color': provider.color, '--provider-tint': provider.tint }}>
                {provider.mark}
              </span>
              <span className="upi-demo-spinner" />
            </div>
            <span className="upi-demo-badge">Payment in progress</span>
            <h2 id="upi-demo-title">Opening {provider.name}…</h2>
            <p>Waiting for confirmation from your UPI app. Please wait.</p>
            <strong className="upi-demo-state-amount">{formatINR(amount)}</strong>
          </div>
        )}

        {stage === 'success' && (
          <div className="upi-demo-state upi-demo-state--success" aria-live="polite">
            <div className="upi-demo-success-mark" aria-hidden="true">
              <span>✓</span>
              {[0, 1, 2, 3, 4, 5].map((dot) => <i key={dot} style={{ '--dot': dot }} />)}
            </div>
            <span className="upi-demo-badge upi-demo-badge--success">Payment complete</span>
            <h2 id="upi-demo-title">Payment successful</h2>
            <p>Your {purposeLabel.toLowerCase()} of {formatINR(amount)} was completed with {provider.name}.</p>
            <div className="upi-demo-receipt">
              <span>UPI reference number</span>
              <strong>{reference}</strong>
            </div>
            <button type="button" className="upi-demo-pay" onClick={finish}>
              Done
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
