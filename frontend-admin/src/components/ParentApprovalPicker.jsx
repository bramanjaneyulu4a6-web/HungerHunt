import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

import api from '../utils/api';
import { useCurrentStaff } from '../utils/currentStaff';
import Icon from './Icon';
import { Badge, Banner, Button } from './ui';
import { formatINR } from '../utils/format';
import { requestNumber } from '../utils/fulfillmentStatus';

/* The badge of an order still waiting on the parent, on the Student Orders
 * board. Every admin sees it; a super admin can open it and answer for the
 * parent, and nothing else — no package stage is offered until it is
 * accepted and paid for. Accept, which charges the wallet and confirms the package exactly
 * as the parent's own approval would, or decline, which charges nothing. The
 * server checks the super admin flag again on the answer itself.
 *
 * `order` needs `id`, `totalAmount` and `student.name`. `onAnswered(answer)`
 * fires with 'APPROVED' or 'REJECTED' once the server has accepted it. */

const approvalKey = (orderId) => {
  const nonce = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `admin-approve-${orderId}-${nonce}`;
};

const errorMessage = (error, fallback) => error.response?.data?.message || fallback;

export default function ParentApprovalPicker({ order, onAnswered }) {
  const { me, loaded } = useCurrentStaff();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState(null); // 'APPROVED' | 'REJECTED'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef(null);
  // One key per confirmation, reused if that confirmation is retried, so a
  // lost response can never charge the wallet twice.
  const keyRef = useRef('');

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

  const badge = <Badge variant="neutral">Sent to parent</Badge>;

  if (!order?.id || !loaded || !me.isSuperAdmin) return badge;

  const studentName = order.student?.name || 'the student';

  const choose = (answer) => {
    setMenuOpen(false);
    setPending(answer);
    setError('');
    if (answer === 'APPROVED') keyRef.current = approvalKey(order.id);
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
      if (pending === 'APPROVED') {
        await api.post(
          `/pending-orders/${order.id}/admin-approve`,
          {},
          { headers: { 'Idempotency-Key': keyRef.current } },
        );
        toast.success(`${requestNumber(order)} accepted. ${formatINR(order.totalAmount)} charged to ${studentName}.`);
      } else {
        await api.post(`/pending-orders/${order.id}/admin-reject`);
        toast.success(`${requestNumber(order)} declined. Nothing was charged.`);
      }
      const answer = pending;
      setPending(null);
      onAnswered?.(answer);
    } catch (requestError) {
      console.error(requestError);
      setError(errorMessage(
        requestError,
        pending === 'APPROVED'
          ? 'This order could not be accepted. It may already have been answered.'
          : 'This order could not be declined. It may already have been answered.',
      ));
    } finally {
      setSaving(false);
    }
  };

  const stop = (event) => event.stopPropagation();

  return (
    <div className="fulfillment-status-picker" ref={rootRef} onClick={stop}>
      <button
        type="button"
        className="fulfillment-status-trigger"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Answer ${requestNumber(order)} for the parent. Current status: sent to parent`}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {badge}
        <Icon name="caret" size={14} />
      </button>

      {menuOpen && (
        <div className="fulfillment-status-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => choose('APPROVED')}>
            Accept for the parent
          </button>
          <button type="button" role="menuitem" className="fulfillment-status-menu__danger" onClick={() => choose('REJECTED')}>
            Decline for the parent
          </button>
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
            <h2 className="modal-title">
              {pending === 'APPROVED' ? `Accept ${requestNumber(order)}?` : `Decline ${requestNumber(order)}?`}
            </h2>
            <p className="fulfillment-cancel-copy">
              {pending === 'APPROVED'
                ? `${formatINR(order.totalAmount)} will be charged to ${studentName}'s wallet and the package confirmed for the warehouse, as if the parent had accepted it. The parent is told you approved it.`
                : `The request is closed and nothing is charged. The parent is told you declined it.`}
            </p>
            {error && <Banner variant="alert" icon="⚠️">{error}</Banner>}
            <div className="modal-actions fulfillment-cancel-actions">
              <Button variant="ghost" disabled={saving} onClick={close}>Leave it with the parent</Button>
              <Button type="submit" variant={pending === 'APPROVED' ? undefined : 'danger'} disabled={saving}>
                {saving
                  ? (pending === 'APPROVED' ? 'Accepting…' : 'Declining…')
                  : (pending === 'APPROVED' ? 'Accept and charge' : 'Decline order')}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
