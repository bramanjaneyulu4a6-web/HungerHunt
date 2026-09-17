/* Deleting a wallet row: the button, and the popup it opens.
 *
 * The Transactions page offers it on cash deposits and wallet charges; every
 * other screen with a Receipt button (the dashboard feed, a student's or a
 * parent's activity, the recharge registry) offers it on cash deposits, right
 * under that Receipt button. All of them raise this one popup, so the office
 * is asked the same question with the same facts wherever it starts.
 *
 * The server (backend utils/ledgerDeletion.js) keeps the row, marks it with
 * who deleted it and why, and moves the money back. It also refuses what it
 * must — a deposit already spent, a charge already refunded — and the popup
 * shows that refusal as it is.
 */
import { useState } from 'react';
import toast from 'react-hot-toast';

import Icon from './Icon';
import { Banner, Button } from './ui';
import api from '../utils/api';
import { useCurrentStaff } from '../utils/currentStaff';
import { DATA_CHANGED_EVENT } from '../utils/dataAutoRefresh';
import { formatINR } from '../utils/format';
import { useDismissableOverlay } from '../utils/overlay';

const REASON_MAX = 200;

const LABELS = { CASH_DEPOSIT: 'Cash Deposit', WALLET_DEDUCTION: 'Wallet Payment' };

export const DeleteTransactionDialog = ({ target, onClose, onDeleted }) => {
  const { me } = useCurrentStaff();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useDismissableOverlay(() => !saving && onClose());

  const deposit = target.kind === 'CASH_DEPOSIT';
  const whose = target.studentName ? `${target.studentName}'s wallet` : "the student's wallet";

  const submit = async (event) => {
    event.preventDefault();
    if (!reason.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      await api.post(`/v1/accounting-exports/movements/${target.id}/delete`, {
        kind: target.kind,
        reason: reason.trim(),
      });
      toast.success('Transaction deleted');
      onDeleted?.();
      // Any other screen showing this wallet reads it again too.
      window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't delete this transaction. Try again.");
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        // The popup can open from inside an expandable row; a click here is
        // not that row's toggle.
        event.stopPropagation();
        if (!saving) onClose();
      }}
    >
      <form
        className="modal tx-delete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-delete-title"
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="modal-title" id="tx-delete-title">Delete this transaction?</h2>
        <p className="tx-delete__copy">
          {deposit
            ? `${formatINR(target.amount)} will be taken back out of ${whose}.`
            : `${formatINR(target.amount)} will be returned to ${whose}. The package and the stock are not changed.`}
          {' '}The entry stays listed, marked deleted, and its receipt is withdrawn.
        </p>

        <dl className="tx-delete__facts">
          <div>
            <dt>Transaction</dt>
            <dd>
              {LABELS[target.kind]} · {formatINR(target.amount)}
              {target.receiptNumber ? ` · ${target.receiptNumber}` : ''}
              {target.reference ? ` · ${target.reference}` : ''}
            </dd>
          </div>
          <div>
            <dt>Made by</dt>
            <dd>{target.madeBy || '—'}</dd>
          </div>
          <div>
            <dt>Deleted by</dt>
            <dd>{me.name || 'You'}</dd>
          </div>
        </dl>

        {error && <Banner variant="alert" icon="⚠️">{error}</Banner>}

        <label className="fulfillment-cancel-label" htmlFor="tx-delete-reason">Reason for deletion</label>
        <textarea
          id="tx-delete-reason"
          className="input"
          rows="3"
          maxLength={REASON_MAX}
          autoFocus
          required
          value={reason}
          placeholder="e.g. Entered twice by mistake"
          onChange={(event) => setReason(event.target.value)}
        />
        <div className="fulfillment-cancel-count">{reason.length}/{REASON_MAX}</div>

        <div className="modal-actions fulfillment-cancel-actions">
          <Button variant="ghost" disabled={saving} onClick={onClose}>Keep it</Button>
          <Button type="submit" variant="danger" disabled={saving || !reason.trim()}>
            <Icon name="trash" size={16} />
            {saving ? 'Deleting…' : 'Delete transaction'}
          </Button>
        </div>
      </form>
    </div>
  );
};

/* The red Delete button that sits under a row's Receipt button. */
export const DeleteTransactionButton = ({ target, onDeleted }) => {
  const [open, setOpen] = useState(false);
  if (!target) return null;

  return (
    <>
      <Button
        variant="ghost"
        className="btn--sm row-actions__delete"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Icon name="trash" size={14} />
        Delete
      </Button>
      {open && (
        <DeleteTransactionDialog
          target={target}
          onClose={() => setOpen(false)}
          onDeleted={() => {
            setOpen(false);
            onDeleted?.();
          }}
        />
      )}
    </>
  );
};

export default DeleteTransactionButton;
