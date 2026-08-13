import { useMemo, useRef, useState } from 'react';
import API from '../services/api';
import { formatINR } from '../utils/format';
import { Banner, Button, Card } from './ui';
import Icon from './Icon';

const formatExpiry = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));

const initialQuantities = (order) =>
  Object.fromEntries(
    order.items.map((item) => [String(item.productId), item.quantity])
  );

export default function PendingApprovalCard({ order, onResolved, onStudentClick }) {
  const approvalKey = useRef(null);
  const [quantities, setQuantities] = useState(() => initialQuantities(order));
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [error, setError] = useState('');
  const student = order.studentId || {};

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

  const setQuantity = (productId, quantity) =>
    setQuantities((current) => ({
      ...current,
      [String(productId)]: quantity,
    }));

  const run = async (request, message) => {
    setBusy(true);
    setConfirming(null);
    setError('');
    try {
      await request();
      await onResolved?.(message);
    } catch (err) {
      setError(
        err.response?.data?.message || 'That did not go through. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  const saveEdits = () =>
    run(
      () =>
        API.put(`/pending-orders/${order._id}`, {
          items: order.items.map((item) => ({
            productId: item.productId,
            quantity: quantities[String(item.productId)] ?? 0,
          })),
        }),
      'Order updated.'
    );

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
                  onClick={() => setQuantity(item.productId, quantity - 1)}
                >
                  <Icon name="minus" size={16} />
                </Button>
                <output aria-label={`${item.name} quantity`}>{quantity}</output>
                <Button
                  variant="ghost"
                  aria-label={`One more ${item.name}`}
                  disabled={busy || quantity >= item.quantity}
                  onClick={() => setQuantity(item.productId, quantity + 1)}
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

      {error && <Banner variant="alert" icon="⚠️" style={{ marginTop: 14 }}>{error}</Banner>}
      {empty && <Banner variant="warn" icon="⚠️" style={{ marginTop: 14 }}>Everything has been removed. Decline this request instead.</Banner>}
      {insufficient && !empty && (
        <Banner variant="alert" icon="⚠️" className="insufficient-note">
          This order is {formatINR(total - Number(student.pocketMoney || 0))} over the available balance.
        </Banner>
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
            <Button variant={confirming === 'approve' ? 'dark' : 'alert'} block disabled={busy} onClick={confirming === 'approve' ? approve : decline}>
              {confirming === 'approve' ? 'Yes, approve' : 'Yes, decline'}
            </Button>
            <Button variant="ghost" block disabled={busy} onClick={() => setConfirming(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="pending-actions">
          <Button variant="dark" block disabled={busy || edited || empty || insufficient} onClick={() => setConfirming('approve')}>
            {busy ? 'Working…' : `Approve ${formatINR(total)}`}
          </Button>
          <Button variant="alert" block disabled={busy} onClick={() => setConfirming('decline')}>Decline</Button>
        </div>
      )}
    </Card>
  );
}
