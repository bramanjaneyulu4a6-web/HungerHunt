import { useState } from 'react';
import toast from 'react-hot-toast';

import api from '../utils/api';
import { Banner, Button } from './ui';
import { digitsOnly, numericFieldProps } from '../utils/numericInput';
import { PURCHASE_CODE_LENGTH, purchaseCodePairProblem } from '../utils/purchaseCode';

/* Setting a child's purchase code from the back office.
 *
 * A purchase code belongs to the parent: they choose it in the app, and the
 * office cannot read it back from anywhere. This dialog exists because the
 * parent app now holds a parent at a gate until every child has one, and a
 * parent who cannot get through that screen — or who has forgotten a code and
 * so cannot reach the reset behind it — has to be able to ring the office and
 * have it done.
 *
 * Which makes this a dialog worth reading twice before using: it replaces a
 * code the child may be using today, and the child has to be told the new one.
 * Its own file rather than a fourth dialog inside the student directory, which
 * has enough of them. */
export const PurchaseCodeDialog = ({ student, onClose, onSaved }) => {
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const box = (id, label, value, onChange) => (
    <>
      <label className="field-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        {...numericFieldProps(PURCHASE_CODE_LENGTH)}
        placeholder="4 digits"
        value={value}
        onChange={(event) => {
          setError('');
          onChange(digitsOnly(event.target.value, PURCHASE_CODE_LENGTH));
        }}
      />
    </>
  );

  const save = async (event) => {
    event.preventDefault();

    const problem = purchaseCodePairProblem(code, confirm);
    if (problem) return setError(problem);

    setSaving(true);

    try {
      await api.put(`/students/${student._id}/purchase-code`, { code });
      toast.success(`Purchase code set for ${student.name}.`);
      onSaved?.();
      onClose();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Could not set the code. Try again.');
      setSaving(false);
    }
  };

  const close = () => !saving && onClose();

  return (
    <div className="modal-backdrop" onClick={close}>
      <form
        className="modal"
        style={{ maxWidth: 380 }}
        onClick={(event) => event.stopPropagation()}
        onSubmit={save}
      >
        <header className="modal-head">
          <div>
            <h3 className="modal-title">Set purchase code</h3>
            <p className="modal-sub">{student.name}</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close dialog">
            ×
          </button>
        </header>

        <Banner variant="warn" icon="🔢">
          This replaces any code {student.name} has now, and only for a parent who
          cannot set it themselves. Tell them the new code — nobody can read it back.
        </Banner>

        {error && (
          <Banner variant="alert" icon="⚠️" style={{ marginTop: 14 }}>
            {error}
          </Banner>
        )}

        <div style={{ marginTop: 14 }}>
          {box('purchase-code', 'New code', code, setCode)}
        </div>
        <div style={{ marginTop: 14 }}>
          {box('purchase-code-confirm', 'Type it again', confirm, setConfirm)}
        </div>

        <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" disabled={saving} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Set code'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default PurchaseCodeDialog;
