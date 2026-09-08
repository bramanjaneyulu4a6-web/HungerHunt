import { formatINR } from '../utils/format';

/* What a payment looks like while it is happening and once it has landed.
   Every surface that takes money shares these two screens — the order payment
   sheet, whether the money comes from a UPI app or the school wallet, and the
   wallet top-up checkout — so a parent sees the same thing settle whichever
   way they paid.

   Neither screen owns a backdrop or an overlay: the sheet around them decides
   what the parent is looking through. Nothing above them may carry a `filter`,
   which would blur the confirmation along with the page behind it. */

// The tile at the centre of both screens: a UPI app's own mark, or the
// wallet's. Colours arrive as custom properties, so this holds no brand.
export function PaymentMark({ color, tint, children }) {
  return (
    <span
      className="upi-demo-provider-mark"
      style={{ '--provider-color': color, '--provider-tint': tint }}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

// The wallet's own mark, in the same colours as its row in the chooser.
export function WalletMark() {
  return <PaymentMark color="#187744" tint="#edf8f1">W</PaymentMark>;
}

export function PaymentProcessingStage({ mark, title, message, amount, titleId }) {
  return (
    <div className="upi-demo-state" aria-live="polite">
      <div className="upi-demo-processing" aria-hidden="true">
        {mark}
        <span className="upi-demo-spinner" />
      </div>
      <span className="upi-demo-badge">Payment in progress</span>
      <h2 id={titleId}>{title}</h2>
      <p>{message}</p>
      <strong className="upi-demo-state-amount">{formatINR(amount)}</strong>
    </div>
  );
}

/* The two ways a payment lands without landing well. Neither carries the
   success stage's receipt — a failed payment has nothing to hand over, and a
   pending one would be promising something the bank has not said yet — and
   both must be dismissed by hand: an auto-close would pull bad news out from
   under a parent still reading it. */
export function PaymentFailedStage({ message, titleId, onDone }) {
  return (
    <div className="upi-demo-state upi-demo-state--failed" aria-live="polite">
      <div className="upi-demo-failed-mark" aria-hidden="true">
        <span>✕</span>
      </div>
      {/* The verdict is the headline itself — full heading weight, in the
         failure's own colour, carrying the dialog's aria-labelledby id. */}
      <h2 id={titleId} className="upi-demo-failed-title">Payment failed</h2>
      <p>{message}</p>
      <button type="button" className="upi-demo-pay" onClick={onDone}>
        Close
      </button>
    </div>
  );
}

export function PaymentPendingStage({ title, message, titleId, onDone }) {
  return (
    <div className="upi-demo-state upi-demo-state--pending" aria-live="polite">
      <div className="upi-demo-pending-mark" aria-hidden="true">
        <span>•••</span>
      </div>
      <span className="upi-demo-badge upi-demo-badge--pending">Still processing</span>
      <h2 id={titleId}>{title}</h2>
      <p>{message}</p>
      <button type="button" className="upi-demo-pay" onClick={onDone}>
        Close
      </button>
    </div>
  );
}

export function PaymentSuccessStage({ title, message, receipt, titleId, onDone = null }) {
  return (
    <div className="upi-demo-state upi-demo-state--success" aria-live="polite">
      <div className="upi-demo-success-mark" aria-hidden="true">
        <span>✓</span>
        {[0, 1, 2, 3, 4, 5].map((dot) => <i key={dot} style={{ '--dot': dot }} />)}
      </div>
      <span className="upi-demo-badge upi-demo-badge--success">Payment complete</span>
      <h2 id={titleId}>{title}</h2>
      <p>{message}</p>
      <div className="upi-demo-receipt">
        <span>{receipt.label}</span>
        <strong>{receipt.value}</strong>
      </div>
      {onDone && (
        <button type="button" className="upi-demo-pay" onClick={onDone}>
          Done
        </button>
      )}
    </div>
  );
}
