import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getIntent, getPublicIntent, pollIntent, TERMINAL_STATUSES } from '../services/payments';
import { useAuth } from '../context/auth';
import { Banner, Button, Card, EmptyState } from '../components/ui';

/* Where PhonePe's checkout redirects when the parent finishes (or abandons).
 * Shows the backend's verdict and nothing else — see the Golden Rule note in
 * services/payments.js. On native, the same intent is usually still being
 * polled by the screen that started the payment; this page is the web
 * fallback and the "I closed the app mid-payment" recovery view.
 *
 * Deliberately not behind ProtectedRoute. PhonePe hands the redirect to
 * whichever browser the parent's UPI app was holding, and on a phone that is
 * a Custom Tab sharing none of the app's localStorage — so requiring a
 * session here would end every native payment on a login screen. The `t`
 * query parameter the backend put in the redirect URL is what lets this
 * screen read one payment's verdict without one.
 *
 * Which read it uses follows from that:
 *   - `t` present  → the public, token-scoped read. Works in any browser,
 *                    signed in or not. This is every PhonePe redirect.
 *   - no `t`, signed in → the ordinary authenticated read, which also covers
 *                    an intent created before tokens existed.
 *   - no `t`, no session → nothing to poll with; say so plainly and point
 *                    back at the app rather than bounce to /login. */
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
  const { parent } = useAuth();
  const intentId = params.get('intent');
  const returnToken = params.get('t');
  const [intent, setIntent] = useState(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [pollFailed, setPollFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Either credential will do; without one there is nothing to ask with.
  const canCheck = Boolean(intentId) && (Boolean(returnToken) || Boolean(parent));

  useEffect(() => {
    if (!canCheck) return undefined;
    let cancelled = false;
    const controller = new AbortController();

    pollIntent(intentId, {
      onUpdate: (i) => !cancelled && setIntent(i),
      signal: controller.signal,
      fetcher: returnToken
        ? (id, options) => getPublicIntent(id, returnToken, options)
        : getIntent,
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
  }, [canCheck, intentId, returnToken, attempt]);

  if (!canCheck) {
    return (
      <div className="page">
        <div style={{ maxWidth: 500, margin: '0 auto' }}>
          {intentId ? (
            /* A payment reference with nothing to prove it is ours to read:
               an old link, a trimmed URL, a different browser. Never a
               reason to alarm anyone — the backend settles this payment on
               its own whatever this page does, so the honest instruction is
               simply to look where the answer is. */
            <EmptyState icon="💳" title="Check this payment in the app">
              This link can't confirm a payment on its own. Open Hunger Hunt
              and the payment's status will be waiting there — nothing is
              held up by this page.
            </EmptyState>
          ) : (
            <EmptyState icon="💳" title="No payment to check">
              This page needs a payment reference to look at.
            </EmptyState>
          )}
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
