import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { pollIntent, TERMINAL_STATUSES } from '../services/payments';
import { Banner, Button, Card, EmptyState } from '../components/ui';

/* Where PhonePe's checkout redirects when the parent finishes (or abandons).
 * Shows the backend's verdict and nothing else — see the Golden Rule note in
 * services/payments.js. On native, the same intent is usually still being
 * polled by the screen that started the payment; this page is the web
 * fallback and the "I closed the app mid-payment" recovery view. */
// APPLIED is split out below — it needs to say what was applied to, which
// depends on the intent's purpose (an order settled vs. a wallet top-up).
const COPY = {
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

const appliedCopy = (purpose) => ({
  title: 'Payment received',
  detail:
    purpose === 'TOPUP'
      ? 'The wallet has been topped up. You can head back to the app.'
      : purpose === 'ORDER'
        ? 'Your order is paid for. You can head back to the app.'
        : 'The money has been applied. You can head back to the app.',
});

const STILL_PROCESSING = {
  title: 'Still checking',
  detail:
    "Your payment is still being processed. It's safe — the school's system will finish confirming it even if you close this page. Check back in a few minutes.",
};

const pollFailedCopy = () => ({
  title: "Can't reach the server right now",
  detail:
    "Your money is safe — nothing on this page decides whether a payment went through, so a connection hiccup here doesn't affect it. Try again, or check back in a few minutes.",
});

export default function PaymentReturn() {
  const [params] = useSearchParams();
  const intentId = params.get('intent');
  const [intent, setIntent] = useState(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [pollFailed, setPollFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!intentId) return undefined;
    let cancelled = false;
    const controller = new AbortController();

    pollIntent(intentId, {
      onUpdate: (i) => !cancelled && setIntent(i),
      signal: controller.signal,
    })
      .then((finalIntent) => {
        if (cancelled) return;
        // pollIntent only resolves (rather than rejects) without a terminal
        // status when the 5-minute cap lapsed — the poll gave up, the
        // payment did not fail.
        if (finalIntent && !TERMINAL_STATUSES.includes(finalIntent.status)) {
          setGaveUp(true);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // An expired session already gets a hard redirect to /login from the
        // shared axios instance (see services/api.js) — showing an error
        // here too would just flash confusing text on the way out.
        const isAuthRequired =
          err?.response?.status === 401 && err?.response?.data?.code === 'AUTH_REQUIRED';
        if (isAuthRequired) return;
        setPollFailed(true);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [intentId, attempt]);

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
    ? intent.status === 'APPLIED'
      ? appliedCopy(intent.purpose)
      : COPY[intent.status]
    : pollFailed
      ? pollFailedCopy()
      : gaveUp
        ? STILL_PROCESSING
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

          {pollFailed && (
            <Button
              variant="primary"
              block
              style={{ marginTop: 24 }}
              onClick={() => {
                setGaveUp(false);
                setPollFailed(false);
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          )}

          <Button
            to="/"
            variant={terminal ? 'primary' : 'ghost'}
            block
            style={{ marginTop: pollFailed ? 12 : 24 }}
          >
            Back to the app
          </Button>
        </Card>
      </div>
    </div>
  );
}
