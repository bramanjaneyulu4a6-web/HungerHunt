import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { pollIntent, TERMINAL_STATUSES } from '../services/payments';
import { Banner, Button, Card, EmptyState } from '../components/ui';

/* Where PhonePe's checkout redirects when the parent finishes (or abandons).
 * Shows the backend's verdict and nothing else — see the Golden Rule note in
 * services/payments.js. On native, the same intent is usually still being
 * polled by the screen that started the payment; this page is the web
 * fallback and the "I closed the app mid-payment" recovery view. */
const COPY = {
  APPLIED: {
    title: 'Payment received',
    detail: 'The money has been applied. You can head back to the app.',
  },
  FAILED: {
    title: 'Payment failed',
    detail: 'Nothing was charged. You can try again from the order.',
  },
  EXPIRED: {
    title: 'Payment window closed',
    detail: 'The payment was not completed in time. Nothing was charged.',
  },
  AMOUNT_MISMATCH: {
    title: 'Payment needs a check',
    detail:
      'The payment arrived but did not match what was expected. The school office will sort it out — your money is safe.',
  },
};

export default function PaymentReturn() {
  const [params] = useSearchParams();
  const intentId = params.get('intent');
  const [intent, setIntent] = useState(null);

  useEffect(() => {
    if (!intentId) return undefined;
    let cancelled = false;

    pollIntent(intentId, { onUpdate: (i) => !cancelled && setIntent(i) }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [intentId]);

  if (!intentId) {
    return (
      <div className="page">
        <div style={{ maxWidth: 500, margin: '0 auto' }}>
          <EmptyState icon="💳" title="No payment to check">
            This page needs a payment reference to look at.
          </EmptyState>
          <Button to="/" variant="ghost" block style={{ marginTop: 20 }}>
            Back to the app
          </Button>
        </div>
      </div>
    );
  }

  const terminal = intent && TERMINAL_STATUSES.includes(intent.status);
  const copy = terminal
    ? COPY[intent.status]
    : {
        title: 'Checking with the bank…',
        detail: 'Hold on — confirming your payment. This usually takes a few seconds.',
      };

  return (
    <div className="page">
      <div style={{ maxWidth: 500, margin: '0 auto' }}>
        <Card>
          <h1 className="page-title" style={{ fontSize: 24 }}>
            {copy.title}
          </h1>
          <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.5, color: 'var(--muted)' }}>
            {copy.detail}
          </p>

          {/* The order could not be completed after the money was already taken,
              so the backend converted it to wallet balance rather than lose it
              or leave it stuck. This is the one outcome a status word cannot
              explain on its own, so it gets its own plain sentence. */}
          {intent?.degradedToTopup && (
            <Banner variant="warn" icon="ℹ️" style={{ marginTop: 20 }}>
              The order itself could not go through after payment, so instead
              of losing the money, the full amount was added to the wallet as
              balance. Nothing was lost — it is sitting as credit rather than
              having paid for that order.
            </Banner>
          )}

          <Button to="/" variant={terminal ? 'primary' : 'ghost'} block style={{ marginTop: 24 }}>
            Back to the app
          </Button>
        </Card>
      </div>
    </div>
  );
}
