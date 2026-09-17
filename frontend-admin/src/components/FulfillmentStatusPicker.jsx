import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

import api from '../utils/api';
import { useFeature } from '../utils/currentStaff';
import Icon from './Icon';
import { Badge, Banner, Button } from './ui';
import { formatINR } from '../utils/format';
import {
  availableFulfillmentStatuses,
  fulfillmentActionLabel,
  fulfillmentBadgeVariant,
  fulfillmentStatusDisplay,
  fulfillmentStatusLabel,
  isCancellableFulfillment,
} from '../utils/fulfillmentStatus';

/* The one control for changing a package's status, wherever that status is
 * shown: the Student Orders board, a student's ledger, a parent's, and the
 * dashboard feed. The badge is the trigger; the menu lists every stage the
 * order is not already in, plus cancellation while the package has not left
 * the storeroom. Each choice confirms in a small form — the handover asks who
 * at the room took the package, cancellation asks why — and the server
 * records the admin who made the change.
 *
 * `order` needs `id` and `status`; `receivedBy`, `totalAmount` and
 * `student.name` improve the copy when present. `onChanged(updated, status,
 * extra)` fires with the server's serialised order so the caller can refresh
 * or patch its own list. */

const orderNumber = (order) => `FO-${String(order.id).slice(-6).toUpperCase()}`;

const cancellationKey = (orderId) => {
  const nonce = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `admin-cancel-${orderId}-${nonce}`;
};

const errorMessage = (error, fallback) =>
  error.response?.data?.message || error.response?.data?.error?.message || fallback;

export default function FulfillmentStatusPicker({ order, label, variant, onChanged }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState(null); // { status } or { cancel: true }
  const [receivedBy, setReceivedBy] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef(null);
  const cancellationKeyRef = useRef('');

  // Either half of the menu can be switched off on /features.
  const canMove = useFeature('orders.changeStatus');
  const canCancel = useFeature('orders.cancelRefund');
  const statuses = canMove ? availableFulfillmentStatuses(order) : [];
  const cancellable = canCancel && isCancellableFulfillment(order);
  const badge = (
    <Badge variant={variant || fulfillmentBadgeVariant(order?.status)}>
      {label || fulfillmentStatusDisplay(order)}
    </Badge>
  );

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDocumentClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const onKey = (event) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDocumentClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (!order?.id || (statuses.length === 0 && !cancellable)) return badge;

  const hasRecordedProof = Boolean(order.receivedBy || order.proofOfDelivery?.receivedBy);

  const choose = (choice) => {
    setMenuOpen(false);
    setPending(choice);
    setError('');
    setReceivedBy('');
    setReceiverPhone('');
    setReason('');
    if (choice.cancel) cancellationKeyRef.current = cancellationKey(order.id);
  };

  const close = () => {
    if (saving) return;
    setPending(null);
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!pending) return;
    setSaving(true);
    setError('');
    try {
      if (pending.cancel) {
        const response = await api.post(
          `/v1/fulfillment-orders/${order.id}/transition`,
          { status: 'CANCELLED', reason: reason.trim() },
          { headers: { 'Idempotency-Key': cancellationKeyRef.current } },
        );
        const refund = response.data.data?.reversal?.amount;
        toast.success(refund == null
          ? `${orderNumber(order)} cancelled.`
          : `${orderNumber(order)} cancelled and ${formatINR(refund)} refunded.`);
        setPending(null);
        onChanged?.(response.data.data?.order, 'CANCELLED', { refund });
        return;
      }

      const body = { status: pending.status };
      if (pending.status === 'DELIVERED' && (receivedBy.trim() || receiverPhone.trim())) {
        body.receivedBy = receivedBy.trim();
        body.receiverPhone = receiverPhone.trim();
      }
      const response = await api.post(`/v1/fulfillment-orders/${order.id}/transition`, body);
      toast.success(`${orderNumber(order)} is now ${fulfillmentActionLabel(pending.status).toLowerCase()}.`);
      setPending(null);
      onChanged?.(response.data.data, pending.status, {});
    } catch (requestError) {
      console.error(requestError);
      setError(errorMessage(
        requestError,
        pending.cancel
          ? 'This order could not be cancelled. It may have moved to another status.'
          : 'The status could not be changed. It may have already been updated.',
      ));
    } finally {
      setSaving(false);
    }
  };

  const stop = (event) => event.stopPropagation();
  const deliveredNeedsProof = pending?.status === 'DELIVERED' && !hasRecordedProof;

  return (
    <div className="fulfillment-status-picker" ref={rootRef} onClick={stop}>
      <button
        type="button"
        className="fulfillment-status-trigger"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Change status for ${orderNumber(order)}. Current status: ${fulfillmentStatusLabel(order.status)}`}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {badge}
        <Icon name="caret" size={14} />
      </button>

      {menuOpen && (
        <div className="fulfillment-status-menu" role="menu">
          {statuses.map((status) => (
            <button type="button" role="menuitem" key={status} onClick={() => choose({ status })}>
              Mark as {fulfillmentActionLabel(status)}
            </button>
          ))}
          {cancellable && (
            <button type="button" role="menuitem" className="fulfillment-status-menu__danger" onClick={() => choose({ cancel: true })}>
              Cancel order and refund
            </button>
          )}
        </div>
      )}

      {pending && (
        <div className="modal-backdrop" onClick={close}>
          <form
            className="modal fulfillment-status-modal"
            role="dialog"
            aria-modal="true"
            onSubmit={submit}
            onClick={stop}
          >
            {pending.cancel ? (
              <>
                <h2 className="modal-title">Cancel {orderNumber(order)}?</h2>
                <p className="fulfillment-cancel-copy">
                  This will refund {order.totalAmount != null ? formatINR(order.totalAmount) : 'the full amount'} to {order.student?.name || 'the student'} and return every item to warehouse stock.
                </p>
                {error && <Banner variant="alert" icon="⚠️">{error}</Banner>}
                <label className="fulfillment-cancel-label" htmlFor={`cancel-reason-${order.id}`}>Cancellation reason</label>
                <textarea
                  id={`cancel-reason-${order.id}`}
                  className="input"
                  rows="4"
                  maxLength="200"
                  autoFocus
                  value={reason}
                  placeholder="Explain why this package should be cancelled."
                  onChange={(event) => setReason(event.target.value)}
                />
                <div className="fulfillment-cancel-count">{reason.length}/200</div>
                <div className="modal-actions fulfillment-cancel-actions">
                  <Button variant="ghost" disabled={saving} onClick={close}>Keep order</Button>
                  <Button type="submit" variant="danger" disabled={saving || !reason.trim()}>
                    {saving ? 'Cancelling…' : 'Cancel and refund'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h2 className="modal-title">
                  {pending.status === 'DELIVERED'
                    ? 'Record the handover to the room?'
                    : `Change status to ${fulfillmentStatusLabel(pending.status)}?`}
                </h2>
                <p className="fulfillment-cancel-copy">
                  {pending.status === 'DELIVERED'
                    ? `${orderNumber(order)} stays out for delivery until its student collects it with their code; this records who is holding it at the room.`
                    : pending.status === 'COLLECTED'
                      ? `${orderNumber(order)} will be recorded as collected by the student, with your account named as the one who confirmed it.`
                      : `${orderNumber(order)} will move from ${fulfillmentStatusLabel(order.status).toLowerCase()} to ${fulfillmentStatusLabel(pending.status).toLowerCase()}. Anything recorded for later stages is cleared.`}
                </p>
                {pending.status === 'DELIVERED' && (
                  <div className="fulfillment-delivery-fields">
                    <label htmlFor={`received-by-${order.id}`}>
                      <span className="field-label">Received by</span>
                      <input
                        id={`received-by-${order.id}`}
                        className="input"
                        maxLength="60"
                        autoFocus
                        required={deliveredNeedsProof}
                        value={receivedBy}
                        placeholder={hasRecordedProof ? 'Leave blank to keep the recorded receiver' : 'Name or room role'}
                        onChange={(event) => setReceivedBy(event.target.value)}
                      />
                    </label>
                    <label htmlFor={`receiver-phone-${order.id}`}>
                      <span className="field-label">Receiver phone</span>
                      <input
                        id={`receiver-phone-${order.id}`}
                        className="input"
                        inputMode="tel"
                        required={deliveredNeedsProof || Boolean(receivedBy.trim())}
                        value={receiverPhone}
                        placeholder="10-digit phone number"
                        onChange={(event) => setReceiverPhone(event.target.value)}
                      />
                    </label>
                  </div>
                )}
                {error && <Banner variant="alert" icon="⚠️">{error}</Banner>}
                <div className="modal-actions fulfillment-cancel-actions">
                  <Button variant="ghost" disabled={saving} onClick={close}>Keep current status</Button>
                  <Button
                    type="submit"
                    disabled={saving || (deliveredNeedsProof && (!receivedBy.trim() || !receiverPhone.trim()))}
                  >
                    {saving ? 'Updating…' : 'Confirm status change'}
                  </Button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
