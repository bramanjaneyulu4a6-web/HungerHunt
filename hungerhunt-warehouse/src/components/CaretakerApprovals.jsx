import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';

import Icon from './Icon';
import NotifyParentButton from './NotifyParentButton';
import { Banner, Button, Card, ConfirmDialog } from './ui';
import api from '../utils/api';
import { formatINR } from '../utils/format';

const formatExpiry = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));

const initialQuantities = (order) =>
  Object.fromEntries(order.items.map((item) => [String(item.productId), item.quantity]));

const failureMessage = (error) =>
  error.response?.data?.message || 'That did not go through. Please try again.';

/* One request, drawn as the parent's app draws it on their dashboard: the
 * compact card, and the same "Review" sheet with the same cart, quantity
 * steppers and totals (frontend-parent/src/components/PendingApprovalCard.jsx,
 * compact mode). The parent handed this decision over, so the caretaker sees
 * the cart the parent would have seen, wallet balance included. Receipts and
 * charge records stay with the family and the office. Accepting charges the
 * wallet; there is no UPI here, that is the parent's own money to move. */
const ApprovalCard = ({ order, onResolved }) => {
  const approvalKey = useRef(null);
  const reviewDialogRef = useRef(null);
  const reviewTriggerRef = useRef(null);
  const busyRef = useRef(false);
  // The accept question opens over the sheet and takes the keyboard with it.
  const confirmingRef = useRef(null);
  const [quantities, setQuantities] = useState(() => initialQuantities(order));
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null); // 'decline' | 'accept' | null
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState('');
  const [constraint, setConstraint] = useState(null);
  const student = order.studentId || {};

  useEffect(() => {
    busyRef.current = busy;
    confirmingRef.current = confirming;
  }, [busy, confirming]);

  const total = useMemo(
    () => order.items.reduce((sum, item) => sum + item.price * (quantities[String(item.productId)] ?? 0), 0),
    [order.items, quantities]
  );
  const edited = order.items.some((item) => quantities[String(item.productId)] !== item.quantity);
  const empty = total === 0;
  const balance = Number(student.pocketMoney || 0);
  const insufficient = total > balance;

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
    setError('');
    try {
      await request();
      toast.success(message);
      setReviewing(false);
      setConfirming(null);
      await onResolved?.();
    } catch (err) {
      setConfirming(null);
      setError(failureMessage(err));
      // Answered elsewhere, expired or no longer handed over: catch up.
      if ([404, 409, 410].includes(err.response?.status)) onResolved?.();
    } finally {
      setBusy(false);
    }
  };

  const accept = () =>
    run(async () => {
      if (!approvalKey.current) {
        approvalKey.current =
          globalThis.crypto?.randomUUID?.() ||
          `${order._id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      // The same two steps as the parent's review: the reduced basket is
      // saved first, then the saved basket is what is charged.
      if (edited) {
        await api.put(`/pending-orders/${order._id}/caretaker`, {
          items: order.items.map((item) => ({
            productId: item.productId,
            quantity: quantities[String(item.productId)] ?? 0,
          })),
        });
      }
      await api.post(
        `/pending-orders/${order._id}/caretaker-approve`,
        {},
        { headers: { 'Idempotency-Key': approvalKey.current } }
      );
    }, `Order accepted — ${formatINR(total)} charged to ${student.name}'s wallet.`);

  const decline = () =>
    run(() => api.post(`/pending-orders/${order._id}/caretaker-reject`), 'Order declined. Nothing was charged.');

  // Focus kept inside the sheet and the page behind it held still, as the
  // parent's sheet does.
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
      if (confirmingRef.current) return;
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
            <div><span>Wallet balance</span><strong>{formatINR(balance)}</strong></div>
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

          {error && <Banner variant="alert" icon="⚠️">{error}</Banner>}
          {insufficient && !empty && (
            <Banner variant="alert" icon="⚠️">
              Not quite enough — the order is {formatINR(total - balance)} over the wallet balance. Reduce it, or ask the parent to top up.
            </Banner>
          )}
          {constraint?.type === 'maximum' && (
            <Banner variant="alert" icon="⚠️">You can reduce this order, but you can&apos;t add more than the student requested.</Banner>
          )}
          {constraint?.type === 'final' && (
            <Banner variant="alert" icon="⚠️">
              Keep one item in the order. Want to decline the entire request instead? Use Cancel Order below.
            </Banner>
          )}
        </div>

        <footer className="review-modal__actions">
          <div>
            <span>Subtotal</span>
            <strong>{formatINR(total)}</strong>
          </div>
          <Button variant="dark" disabled={busy || empty || insufficient} onClick={() => setConfirming('accept')}>
            {busy ? 'Placing order…' : 'Accept order'}
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
            <h3>{student.name || 'Student'}&apos;s order</h3>
          </div>
          <span className="pending-compact__expiry">
            {student.admissionNumber || 'No admission number'}
          </span>
        </div>

        <div className="pending-compact__totals">
          <div><span>Subtotal</span><strong>{formatINR(total)}</strong></div>
          <div><span>Wallet balance</span><strong>{formatINR(balance)}</strong></div>
        </div>

        {error && !reviewing && <Banner variant="alert" icon="⚠️" style={{ marginTop: 12 }}>{error}</Banner>}
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
                setError('');
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

        <NotifyParentButton order={order} />
      </Card>
      {reviewModal}
      {/* Above the review sheet, which is portalled to the body too. */}
      {confirming === 'accept' && createPortal(
        <div className="caretaker-confirm-layer">
          <ConfirmDialog
            title="Accept this order?"
            message={`${formatINR(total)} will be charged to ${student.name}'s wallet and the order sent to the warehouse. Their parent is told you accepted it.`}
            icon="check"
            variant="dark"
            busy={busy}
            onCancel={() => setConfirming(null)}
            onConfirm={accept}
          />
        </div>,
        document.body
      )}
    </>
  );
};

/* Purchase requests the caretaker may answer for the parent: only those whose
 * parent switched on "Let the caretaker accept orders". The server checks that
 * permission again on every tap — a parent who withdraws it mid-shift turns
 * the next Accept into "not found" rather than a charge. Orders the parent
 * still answers are drawn with the room's packages in Student orders instead
 * (pages/CaretakerOrders.jsx), which also loads this list.
 *
 * Draws nothing at all when there is nothing to answer, which is most rooms
 * most of the time. */
const CaretakerApprovals = ({ orders, loadError, onResolved }) => {
  if (orders.length === 0) return null;

  return (
    <section className="caretaker-approvals" aria-labelledby="caretaker-approvals-title">
      <div className="caretaker-student-orders__heading">
        <div>
          <span>Parents have asked you to review</span>
          <h2 id="caretaker-approvals-title">Pending approvals</h2>
        </div>
        <strong>{orders.length}</strong>
      </div>

      {loadError && <Banner variant="alert" icon="⚠️">Could not refresh orders waiting for approval.</Banner>}

      {orders.map((order) => (
        // Keyed on the saved basket too, so a reduction saved elsewhere
        // resets the steppers to what is actually on the order now.
        <ApprovalCard
          key={`${order._id}-${order.totalAmount}`}
          order={order}
          onResolved={onResolved}
        />
      ))}
    </section>
  );
};

export default CaretakerApprovals;
