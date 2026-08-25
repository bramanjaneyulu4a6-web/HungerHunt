import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import API from '../services/api';
import { formatINR } from '../utils/format';
import { Banner, Button, Card } from './ui';
import Icon from './Icon';
import { ErrorFeedback, InlineFieldError } from './error/ErrorFeedback';
import { presentError } from '../utils/errorPresentation';
import { createOrderPayment, pollIntent, startPayment, TERMINAL_STATUSES } from '../services/payments';

const formatExpiry = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));

// Wording matches PaymentReturn.jsx's verdict copy, so a parent reads the
// same language wherever a payment lands — whether that's this card or the
// page PhonePe redirects back to.
const PAY_UPI_TERMINAL_COPY = {
  APPLIED: {
    variant: 'success',
    icon: '✅',
    text: 'Payment received. Your order is paid for.',
  },
  FAILED: {
    variant: 'alert',
    icon: '⚠️',
    text: 'Payment failed. Nothing was charged. You can try again.',
  },
  EXPIRED: {
    variant: 'alert',
    icon: '⚠️',
    text: 'Payment window closed. The payment was not completed in time. Nothing was charged.',
  },
  AMOUNT_MISMATCH: {
    variant: 'alert',
    icon: '⚠️',
    text: 'Payment needs a check. The payment arrived but did not match what was expected. The school office will sort it out — your money is safe.',
  },
};

const DEGRADED_TOPUP_NOTE =
  'The order itself could not go through after payment, so instead of losing the money, the full amount was added to the wallet as balance. Nothing was lost — it is sitting as credit rather than having paid for that order.';

// pollIntent's 5-minute cap lapsed without a terminal status — it gave up,
// the payment did not fail. Same framing PaymentReturn.jsx uses for the
// same situation.
const PAY_UPI_STILL_PROCESSING = {
  variant: 'warn',
  icon: 'ℹ️',
  text:
    "Still checking. Your payment is still being processed. It's safe — the school's system will finish confirming it even if you close this page. Check back in a few minutes.",
};

// pollIntent only rejects after several consecutive network failures, which
// happens after checkout already opened — the payment may have gone
// through. Same reassurance PaymentReturn.jsx gives for the same failure.
const PAY_UPI_POLL_FAILED_COPY = {
  variant: 'alert',
  icon: '⚠️',
  text:
    "Can't reach the server right now. Your money is safe — nothing on this page decides whether a payment went through, so a connection hiccup here doesn't affect it. Try again, or check back in a few minutes.",
};

// A few seconds' grace so a parent actually reads the degraded-payment note
// on this card before onResolved's pending-list refresh can remove it.
const DEGRADED_NOTICE_DELAY_MS = 6000;

const initialQuantities = (order) =>
  Object.fromEntries(
    order.items.map((item) => [String(item.productId), item.quantity])
  );

export default function PendingApprovalCard({ order, onResolved, onStudentClick, compact = false }) {
  const approvalKey = useRef(null);
  const reviewDialogRef = useRef(null);
  const reviewTriggerRef = useRef(null);
  const busyRef = useRef(false);
  const [quantities, setQuantities] = useState(() => initialQuantities(order));
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState(null);
  const [constraint, setConstraint] = useState(null);
  // null | the intent (mid-poll or terminal) | a client-made
  // { synthetic: true, status, message } when the payment never even
  // reached the bank, or when polling itself failed (see payByUpi).
  const [payState, setPayState] = useState(null);
  // Separate from `busy`: `busy` blocks every action on this card while a
  // UPI payment is in flight, but the "Waiting for the bank…" label must
  // only show while this specific flow is the one running it.
  const [payBusy, setPayBusy] = useState(false);
  // True for the few seconds between a degraded APPLIED result and the
  // delayed onResolved call that refreshes the pending list (and would
  // otherwise remove this card before the note is readable).
  const [degradedResolving, setDegradedResolving] = useState(false);
  const student = order.studentId || {};

  const payAbortRef = useRef(null);
  const mountedRef = useRef(true);
  // The last intent this card started paying — kept so "Try again" after a
  // poll failure can resume checking the same payment instead of starting
  // a second one.
  const lastIntentIdRef = useRef(null);
  const degradedNoticeTimeoutRef = useRef(null);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  // A parent who navigates away mid-payment must not leave pollIntent's
  // 3-second loop running in the background for up to 5 minutes, and must
  // not leave the degraded-notice timer trying to update this card later.
  useEffect(
    () => () => {
      mountedRef.current = false;
      payAbortRef.current?.abort();
      if (degradedNoticeTimeoutRef.current) clearTimeout(degradedNoticeTimeoutRef.current);
    },
    []
  );

  const total = useMemo(
    () =>
      order.items.reduce(
        (sum, item) =>
          sum + item.price * (quantities[String(item.productId)] ?? 0),
        0
      ),
    [order.items, quantities]
  );

  const edited = order.items.some(
    (item) => quantities[String(item.productId)] !== item.quantity
  );
  const empty = total === 0;
  const insufficient = total > Number(student.pocketMoney || 0);

  const setQuantity = (item, quantity) => {
    const productId = String(item.productId);
    const totalUnits = Object.values(quantities).reduce((sum, value) => sum + value, 0);
    if (quantity > item.quantity) {
      setConstraint((current) => ({ type: 'maximum', productId, key: (current?.key || 0) + 1 }));
      return;
    }
    if (quantity < 1 && totalUnits <= 1) {
      setConstraint((current) => ({ type: 'final', productId, key: (current?.key || 0) + 1 }));
      return;
    }
    setConstraint(null);
    setQuantities((current) => ({ ...current, [productId]: quantity }));
  };

  const run = async (request, message) => {
    setBusy(true);
    setConfirming(null);
    setError(null);
    try {
      await request();
      await onResolved?.(message);
    } catch (err) {
      setError(presentError(err, { message: err.response?.data?.message || 'That did not go through. Please try again.' }));
    } finally {
      setBusy(false);
    }
  };

  const putEdits = () =>
    API.put(`/pending-orders/${order._id}`, {
      items: order.items.map((item) => ({
        productId: item.productId,
        quantity: quantities[String(item.productId)] ?? 0,
      })),
    });

  const saveEdits = () => run(putEdits, 'Order updated.');

  const approve = () => {
    if (!approvalKey.current) {
      approvalKey.current =
        globalThis.crypto?.randomUUID?.() ||
        `${order._id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    return run(
      () =>
        API.post(
          `/pending-orders/${order._id}/approve`,
          {},
          { headers: { 'Idempotency-Key': approvalKey.current } }
        ),
      'Approved. The wallet has been charged.'
    );
  };

  const decline = () =>
    run(
      () => API.post(`/pending-orders/${order._id}/reject`),
      'Request declined.'
    );

  const isAuthRequiredError = (err) =>
    err?.response?.status === 401 && err?.response?.data?.code === 'AUTH_REQUIRED';

  // Split from payByUpi so "Try again" after a poll failure can resume
  // checking the same intent without creating a second one (a second
  // startPayment call would open a second checkout).
  const runPay = async (intentId, controller) => {
    try {
      const finalIntent = await pollIntent(intentId, {
        onUpdate: (intent) => mountedRef.current && setPayState(intent),
        signal: controller.signal,
      });
      if (!mountedRef.current) return;

      if (finalIntent?.status === 'APPLIED') {
        if (finalIntent.degradedToTopup) {
          // The order itself did not go through even though the money was
          // taken. onResolved refreshes the pending list, which would
          // remove this card — give the parent a few seconds to actually
          // read the note below before that happens. The wallet balance
          // still needs refreshing right away, which onResolved also does.
          setDegradedResolving(true);
          degradedNoticeTimeoutRef.current = setTimeout(() => {
            if (!mountedRef.current) return;
            onResolved?.(DEGRADED_TOPUP_NOTE, { degradedToTopup: true });
          }, DEGRADED_NOTICE_DELAY_MS);
        } else {
          onResolved?.('Paid by UPI. The order is paid for.');
        }
      }
      setPayState(finalIntent);
    } catch (err) {
      if (!mountedRef.current) return;
      // The shared axios instance is already redirecting to /login for
      // this case; a FAILED banner here too would just flash confusing
      // text on the way out.
      if (isAuthRequiredError(err)) return;

      // pollIntent only rejects after several consecutive network
      // failures, which happens after checkout already opened — the
      // payment may well have gone through. This is a connectivity
      // problem with checking, not evidence the payment failed.
      setPayState({ status: 'POLL_FAILED', synthetic: true });
    } finally {
      if (mountedRef.current) {
        setBusy(false);
        setPayBusy(false);
      }
    }
  };

  // Deliberately not gated behind the insufficient-balance guard that blocks
  // Approve — paying by UPI is exactly what a parent reaches for when the
  // wallet doesn't cover the order.
  const payByUpi = async () => {
    if (degradedNoticeTimeoutRef.current) {
      clearTimeout(degradedNoticeTimeoutRef.current);
      degradedNoticeTimeoutRef.current = null;
    }
    setBusy(true);
    setPayBusy(true);
    setPayState(null);
    setDegradedResolving(false);
    setError(null);
    const controller = new AbortController();
    payAbortRef.current = controller;

    let intentId;
    try {
      ({ intentId } = await startPayment(() => createOrderPayment(order._id)));
    } catch (err) {
      if (mountedRef.current) {
        if (!isAuthRequiredError(err)) {
          setPayState({
            status: 'FAILED',
            synthetic: true,
            message: err.response?.data?.message || 'Could not start the payment.',
          });
        }
        setBusy(false);
        setPayBusy(false);
      }
      return;
    }

    if (!mountedRef.current) return;
    lastIntentIdRef.current = intentId;
    await runPay(intentId, controller);
  };

  // Resumes checking the same intent after a poll failure, rather than
  // starting an entirely new payment.
  const retryPay = () => {
    const intentId = lastIntentIdRef.current;
    if (!intentId) return;
    setBusy(true);
    setPayBusy(true);
    setPayState(null);
    const controller = new AbortController();
    payAbortRef.current = controller;
    runPay(intentId, controller);
  };

  // Keyed on the client-made `synthetic` flag rather than presence of a
  // `.message` field, so a future backend field happening to be named
  // `message` on a non-terminal intent can't be mistaken for one of ours.
  const payTerminal =
    payState &&
    typeof payState === 'object' &&
    (payState.synthetic || TERMINAL_STATUSES.includes(payState.status));

  // pollIntent's 5-minute cap lapsed and handed back the last non-terminal
  // status it saw — the poll gave up, the payment itself did not fail.
  const payGaveUp = !payBusy && payState && typeof payState === 'object' && !payTerminal;

  const payCopy = payTerminal
    ? payState.synthetic
      ? payState.status === 'POLL_FAILED'
        ? PAY_UPI_POLL_FAILED_COPY
        : { variant: 'alert', icon: '⚠️', text: payState.message }
      : PAY_UPI_TERMINAL_COPY[payState.status]
    : payGaveUp
      ? PAY_UPI_STILL_PROCESSING
      : null;

  const payByUpiFromReview = async () => {
    if (edited) {
      setBusy(true);
      setError(null);
      try {
        await putEdits();
      } catch (err) {
        setError(presentError(err, { message: err.response?.data?.message || 'That did not go through. Please try again.' }));
        setBusy(false);
        return;
      }
    }
    await payByUpi();
  };

  const placeOrder = async () => {
    if (!approvalKey.current) {
      approvalKey.current =
        globalThis.crypto?.randomUUID?.() ||
        `${order._id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    setBusy(true);
    setError(null);
    try {
      if (edited) {
        await API.put(`/pending-orders/${order._id}`, {
          items: order.items.map((item) => ({
            productId: item.productId,
            quantity: quantities[String(item.productId)] ?? 0,
          })),
        });
      }

      await API.post(
        `/pending-orders/${order._id}/approve`,
        {},
        { headers: { 'Idempotency-Key': approvalKey.current } }
      );
      setReviewing(false);
      await onResolved?.('Order placed. The wallet has been charged.');
    } catch (err) {
      setError(presentError(err, { message: err.response?.data?.message || 'That did not go through. Please try again.' }));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!reviewing) return undefined;

    const dialog = reviewDialogRef.current;
    const trigger = reviewTriggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusable = () =>
      [...dialog.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.disabled);

    focusable()[0]?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busyRef.current) {
        setReviewing(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      trigger?.focus();
    };
  }, [reviewing]);

  if (compact) {
    const reviewModal = reviewing && createPortal(
      <div
        className="review-modal-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) setReviewing(false);
        }}
      >
        <section
          ref={reviewDialogRef}
          className="review-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`review-title-${order._id}`}
          aria-describedby={`review-copy-${order._id}`}
        >
          <header className="review-modal__head">
            <div>
              <p className="section-eyebrow">Review required</p>
              <h2 id={`review-title-${order._id}`}>{student.name || 'Student'}&apos;s cart</h2>
              <p id={`review-copy-${order._id}`}>
                Check every item before placing this order.
              </p>
            </div>
            <button
              type="button"
              className="review-modal__close"
              aria-label="Close order review"
              disabled={busy}
              onClick={() => setReviewing(false)}
            >
              <Icon name="close" size={20} />
            </button>
          </header>

          <div className="review-modal__body">
            <div className="review-modal__summary">
              <div><span>Wallet balance</span><strong>{formatINR(student.pocketMoney || 0)}</strong></div>
              <div><span>Cart subtotal</span><strong>{formatINR(total)}</strong></div>
              <div><span>Expires</span><strong>{formatExpiry(order.expiresAt)}</strong></div>
            </div>

            <h3>Cart items</h3>
            <ul className="review-cart">
              {order.items.map((item) => {
                const itemId = String(item.productId);
                const quantity = quantities[itemId] ?? 0;
                return (
                  <li key={itemId} className={quantity === 0 ? 'review-cart__item--removed' : ''}>
                    <div className="review-cart__product">
                      <strong>{item.name}</strong>
                      <span>{formatINR(item.price)} each</span>
                    </div>
                    <div className="quantity-control">
                      <Button
                        variant="ghost"
                        aria-label={`One fewer ${item.name}`}
                        disabled={busy || quantity === 0}
                        onClick={() => setQuantity(item, quantity - 1)}
                      >
                        <Icon name="minus" size={16} />
                      </Button>
                      <output key={constraint?.productId === itemId ? constraint.key : 'steady'} className={constraint?.productId === itemId ? 'quantity-resist' : ''} aria-label={`${item.name} quantity`}>{quantity}</output>
                      <Button
                        variant="ghost"
                        aria-label={`One more ${item.name}`}
                        disabled={busy}
                        aria-disabled={quantity >= item.quantity}
                        onClick={() => setQuantity(item, quantity + 1)}
                      >
                        <Icon name="plus" size={16} />
                      </Button>
                    </div>
                    <strong className="review-cart__line-total">
                      {formatINR(item.price * quantity)}
                    </strong>
                  </li>
                );
              })}
            </ul>

            {error && <ErrorFeedback issue={error} action={error.presentation === 'staleData' ? { label: 'Review latest order', onClick: () => onResolved?.() } : undefined} />}
            {constraint?.type === 'maximum' && <InlineFieldError>You can reduce this order, but you can&apos;t add more than the student requested.</InlineFieldError>}
            {constraint?.type === 'final' && <ErrorFeedback issue={{ presentation: 'blocked', title: 'Keep one item in the order', message: 'Want to decline the entire request instead?' }} action={{ label: 'Decline Order', onClick: () => { setReviewing(false); setConfirming('decline'); } }} />}
            {insufficient && !empty && (
              <ErrorFeedback issue={{ presentation: 'insufficientFunds', title: 'Not quite enough', message: 'The order is over the wallet balance — pay by UPI below to cover it.' }} available={Number(student.pocketMoney || 0)} required={total} />
            )}
            {payCopy && (
              <Banner variant={payCopy.variant} icon={payCopy.icon} style={{ marginTop: 16 }}>
                {payCopy.text}
              </Banner>
            )}
            {payTerminal && payState.degradedToTopup && (
              <Banner variant="warn" icon="ℹ️" style={{ marginTop: 8 }}>
                {DEGRADED_TOPUP_NOTE}
              </Banner>
            )}
            {payState?.status === 'POLL_FAILED' && !payBusy && (
              <Button variant="ghost" block onClick={retryPay} style={{ marginTop: 8 }}>
                Try again
              </Button>
            )}
          </div>

          <footer className="review-modal__actions">
            {degradedResolving ? null : (
              <>
                <div>
                  <span>Subtotal</span>
                  <strong>{formatINR(total)}</strong>
                </div>
                <Button
                  variant="dark"
                  disabled={busy || empty || insufficient}
                  onClick={placeOrder}
                >
                  {busy && !payBusy ? 'Placing order…' : 'Place Order'}
                </Button>
                {/* Not gated on `insufficient` — a wallet that can't cover
                    the order is exactly when a parent reaches for this. */}
                <Button
                  variant="ghost"
                  disabled={busy || empty}
                  onClick={payByUpiFromReview}
                >
                  {payBusy ? 'Waiting for the bank…' : 'Pay by UPI'}
                </Button>
                <Button
                  variant="alert"
                  className="btn--cancel-order"
                  disabled={busy}
                  onClick={() => {
                    setReviewing(false);
                    setConfirming('decline');
                  }}
                >
                  Cancel Order
                </Button>
              </>
            )}
          </footer>
        </section>
      </div>,
      document.body
    );

    return (
      <>
        <Card className={`pending-card pending-card--compact${busy ? ' pending-card--busy' : ''}`} aria-busy={busy}>
          <div className="pending-compact__head">
            <div>
              <span className="pending-compact__eyebrow">Review required</span>
              <h3>{student.name || 'Your child'}&apos;s order</h3>
            </div>
          </div>

          <div className="pending-compact__totals">
            <div><span>Subtotal</span><strong>{formatINR(total)}</strong></div>
            <div><span>Wallet balance</span><strong>{formatINR(student.pocketMoney || 0)}</strong></div>
          </div>

          {error && <ErrorFeedback issue={error} action={error.presentation === 'staleData' ? { label: 'Refresh order', onClick: () => onResolved?.() } : undefined} />}
          {confirming === 'decline' ? (
            <div className="pending-confirm-copy">
              <p>Cancel this order request?</p>
              <div className="pending-actions">
                <Button variant="ghost" block disabled={busy} onClick={() => setConfirming(null)}>
                  Keep order
                </Button>
                <Button variant="alert" className="btn--cancel-order" block disabled={busy} onClick={decline}>
                  {busy ? 'Cancelling…' : 'Yes, cancel order'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="pending-actions pending-compact__actions">
              <Button
                variant="dark"
                block
                disabled={busy}
                onClick={(event) => {
                  reviewTriggerRef.current = event.currentTarget;
                  setError(null);
                  setReviewing(true);
                }}
              >
                Review
              </Button>
              <Button variant="alert" className="btn--cancel-order" block disabled={busy} onClick={() => setConfirming('decline')}>
                Cancel
              </Button>
            </div>
          )}
        </Card>
        {reviewModal}
      </>
    );
  }

  return (
    <Card className={`pending-card${busy ? ' pending-card--busy' : ''}`} aria-busy={busy}>
      <div className="pending-head">
        {onStudentClick ? (
          <button type="button" className="pending-student" onClick={onStudentClick}>
            <span className="student-avatar" aria-hidden="true">
              {student.name?.charAt(0).toUpperCase() || 'S'}
            </span>
            <span>
              <b>{student.name || 'Your child'}</b>
              <small>Grade {student.grade || '—'} · Room {student.hostelNumber || '—'}</small>
            </span>
          </button>
        ) : (
          <div className="pending-student pending-student--static">
            <span className="student-avatar" aria-hidden="true">
              {student.name?.charAt(0).toUpperCase() || 'S'}
            </span>
            <span>
              <b>{student.name || 'Your child'}</b>
              <small>Grade {student.grade || '—'} · Room {student.hostelNumber || '—'}</small>
            </span>
          </div>
        )}

        <div className="pending-balance">
          <small>Wallet</small>
          <b>{formatINR(student.pocketMoney || 0)}</b>
        </div>
      </div>

      <p className="pending-expiry">
        <Icon name="clock" size={14} /> Expires {formatExpiry(order.expiresAt)}
      </p>

      <ul className="pending-items">
        {order.items.map((item) => {
          const itemId = String(item.productId);
          const quantity = quantities[itemId] ?? 0;
          return (
            <li key={itemId} className="ledger-row">
              <span className={quantity === 0 ? 'pending-item--removed' : ''}>
                {item.name}
                <small>{formatINR(item.price)} each</small>
              </span>
              <span className="quantity-control">
                <Button
                  variant="ghost"
                  aria-label={`One fewer ${item.name}`}
                  disabled={busy || quantity === 0}
                  onClick={() => setQuantity(item, quantity - 1)}
                >
                  <Icon name="minus" size={16} />
                </Button>
                <output key={constraint?.productId === itemId ? constraint.key : 'steady'} className={constraint?.productId === itemId ? 'quantity-resist' : ''} aria-label={`${item.name} quantity`}>{quantity}</output>
                <Button
                  variant="ghost"
                  aria-label={`One more ${item.name}`}
                  disabled={busy}
                  aria-disabled={quantity >= item.quantity}
                  onClick={() => setQuantity(item, quantity + 1)}
                >
                  <Icon name="plus" size={16} />
                </Button>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="ledger-total">
        <span>Order total</span>
        <span className="amount-out">{formatINR(total)}</span>
      </div>

      {error && <ErrorFeedback issue={error} className="pending-error" action={error.presentation === 'staleData' ? { label: 'Refresh order', onClick: () => onResolved?.() } : undefined} />}
      {constraint?.type === 'maximum' && <InlineFieldError>You can reduce this order, but you can&apos;t add more than the student requested.</InlineFieldError>}
      {constraint?.type === 'final' && <ErrorFeedback issue={{ presentation: 'blocked', title: 'Keep one item in the order', message: 'Want to decline the entire request instead?' }} action={{ label: 'Decline Order', onClick: () => setConfirming('decline') }} />}
      {insufficient && !empty && (
        <ErrorFeedback issue={{ presentation: 'insufficientFunds', title: 'Not quite enough', message: 'Reduce the order or add money before approving it.' }} available={Number(student.pocketMoney || 0)} required={total} className="insufficient-note" />
      )}

      {edited && !empty && (
        <div className="pending-actions">
          <Button block disabled={busy} onClick={saveEdits}>{busy ? 'Saving…' : 'Save changes'}</Button>
          <Button variant="ghost" block disabled={busy} onClick={() => setQuantities(initialQuantities(order))}>Undo</Button>
        </div>
      )}

      {confirming ? (
        <div className="pending-confirm-copy">
          <p>
            {confirming === 'approve'
              ? `Charge ${formatINR(total)} from ${student.name || 'this student'}'s wallet now?`
              : 'Decline this request? The kiosk order will be cancelled.'}
          </p>
          <div className="pending-actions">
            {confirming === 'approve' ? (
              <>
                <Button variant="dark" block disabled={busy} onClick={approve}>Yes, approve</Button>
                <Button variant="ghost" block disabled={busy} onClick={() => setConfirming(null)}>Cancel</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" block disabled={busy} onClick={() => setConfirming(null)}>Keep order</Button>
                <Button variant="alert" className="btn--cancel-order" block disabled={busy} onClick={decline}>Yes, decline</Button>
              </>
            )}
          </div>
        </div>
      ) : degradedResolving ? null : (
        <>
          <div className="pending-actions">
            <Button variant="dark" block disabled={busy || edited || empty || insufficient} onClick={() => setConfirming('approve')}>
              {busy && !payBusy ? 'Working…' : `Approve ${formatINR(total)}`}
            </Button>
            <Button variant="alert" className="btn--cancel-order" block disabled={busy} onClick={() => setConfirming('decline')}>Decline</Button>
          </div>
          {/* Not gated on `insufficient` — a wallet that can't cover the order
              is exactly when a parent reaches for this button. */}
          <div className="pending-actions">
            <Button variant="ghost" block disabled={busy || edited} onClick={payByUpi}>
              {payBusy ? 'Waiting for the bank…' : 'Pay by UPI'}
            </Button>
          </div>
        </>
      )}

      {payCopy && (
        <Banner variant={payCopy.variant} icon={payCopy.icon} style={{ marginTop: 12 }}>
          {payCopy.text}
        </Banner>
      )}
      {payTerminal && payState.degradedToTopup && (
        <Banner variant="warn" icon="ℹ️" style={{ marginTop: 8 }}>
          {DEGRADED_TOPUP_NOTE}
        </Banner>
      )}
      {payState?.status === 'POLL_FAILED' && !payBusy && (
        <Button variant="ghost" block onClick={retryPay} style={{ marginTop: 8 }}>
          Try again
        </Button>
      )}
    </Card>
  );
}
