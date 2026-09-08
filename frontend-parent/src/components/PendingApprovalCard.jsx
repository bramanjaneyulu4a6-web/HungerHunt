import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import API from '../services/api';
import { formatClass, formatINR } from '../utils/format';
import { upiOffer } from '../utils/paymentsAccess';
import { Banner, Button, Card } from './ui';
import Icon from './Icon';
import PaymentMethodChooser from './PaymentMethodChooser';
import { DEMO_UPI_PROVIDERS } from '../utils/demoUpi';
import { ErrorFeedback, InlineFieldError } from './error/ErrorFeedback';
import { presentError } from '../utils/errorPresentation';
import { COLLECT_POLL_TIMEOUT_MS, createOrderPayment, CUSTOM_UPI_INTENT_ENABLED, DEMO_UPI_ENABLED, pollIntent, startPayment, TERMINAL_STATUSES, UPI_COLLECT_ENABLED, usePaymentsAvailable } from '../services/payments';

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

// pollIntent's 2-minute cap lapsed without a terminal status — it gave up,
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
  const navigate = useNavigate();
  const approvalKey = useRef(null);
  const reviewDialogRef = useRef(null);
  const reviewTriggerRef = useRef(null);
  const busyRef = useRef(false);
  const [quantities, setQuantities] = useState(() => initialQuantities(order));
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [paymentChooserOpen, setPaymentChooserOpen] = useState(false);
  /* Whether this account may reach the live gateway. False for every parent
     but the marked test accounts, and false until the server has said so —
     which lands this card on exactly the flow a build with payments switched
     off has always shown. */
  const paymentsAvailable = usePaymentsAvailable();
  const [demoOrderResult, setDemoOrderResult] = useState(null);
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
  // 3-second loop running in the background for up to 2 minutes, and must
  // not leave the degraded-notice timer trying to update this card later.
  useEffect(() => {
    // Strict Mode rehearses this effect once before the real mount. Reset the
    // flag here so that rehearsal cleanup does not make every later payment
    // result look as though it arrived after unmount.
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      payAbortRef.current?.abort();
      if (degradedNoticeTimeoutRef.current) clearTimeout(degradedNoticeTimeoutRef.current);
    };
  }, []);

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

  /* The wallet charge, and nothing after it. onResolved is deliberately not
     called here: it refreshes the pending list, which unmounts this card and
     the payment sheet with it — before the parent has seen the payment land.
     completeWalletPayment runs it once the confirmation has had its moment. */
  const chargeWallet = async () => {
    if (!approvalKey.current) {
      approvalKey.current =
        globalThis.crypto?.randomUUID?.() ||
        `${order._id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    // Only ever true in the compact card, whose review modal edits the cart;
    // the full card keeps Accept disabled until the edits are saved.
    if (edited) await putEdits();

    await API.post(
      `/pending-orders/${order._id}/approve`,
      {},
      { headers: { 'Idempotency-Key': approvalKey.current } }
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
  const runPay = async (intentId, controller, { deferResolution = false, collect = false } = {}) => {
    try {
      const finalIntent = await pollIntent(intentId, {
        onUpdate: (intent) => mountedRef.current && setPayState(intent),
        signal: controller.signal,
        // A collect request waits on someone walking to their phone, so it is
        // given longer before this screen stops watching. Nothing is lost past
        // it either way: the backend settles the payment regardless.
        ...(collect ? { timeoutMs: COLLECT_POLL_TIMEOUT_MS } : {}),
      });
      if (!mountedRef.current) return;

      if (finalIntent?.status === 'APPLIED') {
        if (finalIntent.degradedToTopup) {
          // The order itself did not go through even though the money was
          // taken. onResolved refreshes the pending list, which would
          // remove this card — give the parent a few seconds to actually
          // read the note below before that happens. The wallet balance
          // still needs the latest server state right away, which onResolved also loads.
          setDegradedResolving(true);
          degradedNoticeTimeoutRef.current = setTimeout(() => {
            if (!mountedRef.current) return;
            onResolved?.(DEGRADED_TOPUP_NOTE, { degradedToTopup: true });
          }, DEGRADED_NOTICE_DELAY_MS);
        } else if (!deferResolution) {
          onResolved?.('Paid by UPI. The order is paid for.');
        }
      }
      setPayState(finalIntent);
      return finalIntent?.degradedToTopup
        ? { ...finalIntent, status: 'DEGRADED' }
        : finalIntent;
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
      return null;
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
  const payByUpi = async (choice, { deferResolution = false } = {}) => {
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
      ({ intentId } = await startPayment(() => createOrderPayment(order._id, choice)));
    } catch (err) {
      if (mountedRef.current) {
        if (!isAuthRequiredError(err)) {
          setPayState({
            status: 'FAILED',
            synthetic: true,
            message:
              err.response?.data?.message ||
              err.message ||
              'Could not start the payment.',
          });
        }
        setBusy(false);
        setPayBusy(false);
      }
      return null;
    }

    if (!mountedRef.current) return;
    lastIntentIdRef.current = intentId;
    return runPay(intentId, controller, { deferResolution, collect: Boolean(choice?.vpa) });
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

  // pollIntent's 2-minute cap lapsed and handed back the last non-terminal
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

  const openPaymentChooser = () => {
    setError(null);
    setDemoOrderResult(null);
    setPaymentChooserOpen(true);
  };

  /* Awaited by the payment sheet, which shows its confirmation on a truthy
     answer. A failure closes the sheet instead, so the error lands in the
     card's own ErrorFeedback — which knows how to offer a way out of a stale
     order or a wallet that fell short, as an inline apology never could. */
  const payThroughWallet = async () => {
    setBusy(true);
    setError(null);
    try {
      await chargeWallet();
      return true;
    } catch (err) {
      setError(presentError(err, { message: err.response?.data?.message || 'That did not go through. Please try again.' }));
      setPaymentChooserOpen(false);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const completeWalletPayment = () => {
    setPaymentChooserOpen(false);
    setReviewing(false);
    setConfirming(null);
    onResolved?.('Order placed. The wallet has been charged.');
  };

  /* Demo and native Custom Checkout both use Hunger Hunt's app picker. Live
     web checkout stays a single UPI row because desktop users need PhonePe's
     hosted QR fallback rather than an installed-app intent. */
  /* Two separate questions, and keeping them separate is the point.

     Whether this sheet offers UPI at all is a runtime fact about the account:
     an ordinary parent gets the wallet and nothing else, because the gateway
     is restricted to the accounts PhonePe is reviewing with.

     Whether those rows are simulated is a build fact, and only a build fact.
     Folding "this parent may not pay" into it — as `|| !paymentsAvailable`
     did — answered a real parent's tap with a fabricated payment
     confirmation, and made the mode change under an already-open sheet the
     moment the availability answer landed: the confirmation timer cancels
     itself on that flip and strands the parent on a spinner they cannot
     dismiss. A build constant cannot flip. */
  const { upiEnabled, demo: demoCheckout } = upiOffer({
    canPay: paymentsAvailable,
    demoEnabled: DEMO_UPI_ENABLED,
  });
  const customIntentCheckout = !demoCheckout && CUSTOM_UPI_INTENT_ENABLED;
  // A typed UPI ID needs no installed app, so it is offered wherever the live
  // gateway is — including the browser, where the app rows are not.
  const collectCheckout = !demoCheckout && UPI_COLLECT_ENABLED;

  // Live web fallback: PhonePe's hosted page owns the next choice.
  const chooseUpi = () => {
    setPaymentChooserOpen(false);
    if (compact) payByUpiFromReview();
    else payByUpi();
  };

  const chooseCustomUpi = async (choice) => {
    if (edited) {
      setBusy(true);
      setError(null);
      try {
        await putEdits();
      } catch (err) {
        setError(presentError(err, { message: err.response?.data?.message || 'That did not go through. Please try again.' }));
        setBusy(false);
        return null;
      }
    }
    return payByUpi(choice, { deferResolution: true });
  };

  /* Which of the two the sheet's UPI rows lead to. A typed address always
     settles inside the sheet, even on a web build whose app rows would hand
     over to PhonePe's hosted page — there is no page to hand over to, and the
     parent is waiting on their own phone rather than on this screen. */
  const chooseUpiMethod = (choice) =>
    customIntentCheckout || choice?.vpa ? chooseCustomUpi(choice) : chooseUpi();

  /* The demo payment confirms inside the chooser, so by the time this runs
     the parent has already seen it succeed. Everything that was open closes
     together, in one step, rather than one popup replacing another. */
  const completeDemoOrderPayment = (result) => {
    setDemoOrderResult(result);
    setPaymentChooserOpen(false);
    setReviewing(false);
    setConfirming(null);
    navigate('/', { replace: true });
  };

  const completeCustomOrderPayment = () => {
    setPaymentChooserOpen(false);
    setReviewing(false);
    setConfirming(null);
    onResolved?.('Paid by UPI. The order is paid for.');
  };

  const paymentOverlays = (
    <>
      {paymentChooserOpen && (
        <PaymentMethodChooser
          amount={total}
          walletBalance={Number(student.pocketMoney || 0)}
          studentName={student.name || 'your child'}
          walletDisabled={insufficient || empty}
          busy={busy}
          upiEnabled={upiEnabled}
          upiProviders={demoCheckout || customIntentCheckout ? DEMO_UPI_PROVIDERS : null}
          collectEnabled={collectCheckout}
          demoUpi={demoCheckout}
          onWallet={payThroughWallet}
          onWalletPaid={completeWalletPayment}
          onUpi={chooseUpiMethod}
          onUpiPaid={demoCheckout ? completeDemoOrderPayment : completeCustomOrderPayment}
          onClose={() => setPaymentChooserOpen(false)}
        />
      )}
    </>
  );

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
            {demoOrderResult && (
              <Banner variant="success" icon="✓" style={{ marginTop: 16 }}>
                Payment completed with {demoOrderResult.provider}.
              </Banner>
            )}
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
                  disabled={busy || empty}
                  onClick={openPaymentChooser}
                >
                  {busy && !payBusy ? 'Placing order…' : 'Accept order'}
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

          {error && <ErrorFeedback issue={error} action={error.presentation === 'staleData' ? { label: 'View latest order', onClick: () => onResolved?.() } : undefined} />}
          {demoOrderResult && (
            <Banner variant="success" icon="✓" style={{ marginTop: 12 }}>
              Payment completed with {demoOrderResult.provider}.
            </Banner>
          )}
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
        {paymentOverlays}
      </>
    );
  }

  return (
    <>
    <Card className={`pending-card${busy ? ' pending-card--busy' : ''}`} aria-busy={busy}>
      <div className="pending-head">
        {onStudentClick ? (
          <button type="button" className="pending-student" onClick={onStudentClick}>
            <span className="student-avatar" aria-hidden="true">
              {student.name?.charAt(0).toUpperCase() || 'S'}
            </span>
            <span>
              <b>{student.name || 'Your child'}</b>
              <small>Class {formatClass(student) || '—'} · Room {student.roomNumber || '—'}</small>
            </span>
          </button>
        ) : (
          <div className="pending-student pending-student--static">
            <span className="student-avatar" aria-hidden="true">
              {student.name?.charAt(0).toUpperCase() || 'S'}
            </span>
            <span>
              <b>{student.name || 'Your child'}</b>
              <small>Class {formatClass(student) || '—'} · Room {student.roomNumber || '—'}</small>
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

      {error && <ErrorFeedback issue={error} className="pending-error" action={error.presentation === 'staleData' ? { label: 'View latest order', onClick: () => onResolved?.() } : undefined} />}
      {constraint?.type === 'maximum' && <InlineFieldError>You can reduce this order, but you can&apos;t add more than the student requested.</InlineFieldError>}
      {constraint?.type === 'final' && <ErrorFeedback issue={{ presentation: 'blocked', title: 'Keep one item in the order', message: 'Want to decline the entire request instead?' }} action={{ label: 'Decline Order', onClick: () => setConfirming('decline') }} />}
      {insufficient && !empty && (
        <ErrorFeedback issue={{ presentation: 'insufficientFunds', title: 'Not quite enough', message: 'The school wallet cannot cover this order, but you can choose UPI after accepting it.' }} available={Number(student.pocketMoney || 0)} required={total} className="insufficient-note" />
      )}

      {demoOrderResult && (
        <Banner variant="success" icon="✓" style={{ marginTop: 12 }}>
          Payment completed with {demoOrderResult.provider}.
        </Banner>
      )}

      {edited && !empty && (
        <div className="pending-actions">
          <Button block disabled={busy} onClick={saveEdits}>{busy ? 'Saving…' : 'Save changes'}</Button>
          <Button variant="ghost" block disabled={busy} onClick={() => setQuantities(initialQuantities(order))}>Undo</Button>
        </div>
      )}

      {confirming === 'decline' ? (
        <div className="pending-confirm-copy">
          <p>Decline this request? The kiosk order will be cancelled.</p>
          <div className="pending-actions">
            <Button variant="ghost" block disabled={busy} onClick={() => setConfirming(null)}>Keep order</Button>
            <Button variant="alert" className="btn--cancel-order" block disabled={busy} onClick={decline}>Yes, decline</Button>
          </div>
        </div>
      ) : degradedResolving ? null : (
        <>
          <div className="pending-actions">
            <Button variant="dark" block disabled={busy || edited || empty} onClick={openPaymentChooser}>
              {busy && !payBusy ? 'Working…' : `Accept ${formatINR(total)}`}
            </Button>
            <Button variant="alert" className="btn--cancel-order" block disabled={busy} onClick={() => setConfirming('decline')}>Decline</Button>
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
    {paymentOverlays}
    </>
  );
}
