import { useState } from 'react';
import toast from 'react-hot-toast';

import api from '../utils/api';
import { NOTE_MAX_LENGTH, NOTE_MIN_LENGTH } from '../utils/reports';

/* One form for both things a caretaker can raise, because they are the same
   act: pick what it is about, say what happened, send it.
 *
 * The categories are buttons rather than a select. A caretaker files one of
 * these with a student in front of them and a queue behind, and a native
 * select on a phone is two taps and a scroll away from the thing they meant. */
const ReportForm = ({ kind, categories, orderId, submitLabel, onFiled, onCancel }) => {
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const trimmed = note.trim();
  const ready = Boolean(category) && trimmed.length >= NOTE_MIN_LENGTH && !sending;

  const submit = async (event) => {
    event.preventDefault();
    if (!ready) return;

    setSending(true);
    try {
      await api.post('/v1/caretaker/reports', {
        kind,
        category,
        note: trimmed,
        ...(orderId ? { orderId } : {}),
      });
      setCategory('');
      setNote('');
      toast.success('Sent to the office');
      onFiled?.();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || 'Could not send this report');
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="wh-report-form" onSubmit={submit}>
      <p className="wh-field-label">What is this about?</p>
      <div className="wh-report-choices" role="group" aria-label="Report category">
        {categories.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`wh-report-choice${category === value ? ' active' : ''}`}
            aria-pressed={category === value}
            onClick={() => setCategory(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="wh-field-label" htmlFor={`note-${kind}-${orderId || 'general'}`}>
        What happened?
      </label>
      <textarea
        id={`note-${kind}-${orderId || 'general'}`}
        className="wh-input wh-report-note"
        value={note}
        onChange={(event) => setNote(event.target.value.slice(0, NOTE_MAX_LENGTH))}
        rows={4}
        placeholder="Write it in your own words. The office reads this."
        disabled={sending}
      />
      <p className="wh-report-count">
        {trimmed.length < NOTE_MIN_LENGTH
          ? `At least ${NOTE_MIN_LENGTH} characters`
          : `${note.length} of ${NOTE_MAX_LENGTH}`}
      </p>

      <div className="wh-report-actions">
        {onCancel && (
          <button type="button" className="wh-cancel wh-report-cancel" onClick={onCancel} disabled={sending}>
            Cancel
          </button>
        )}
        <button type="submit" className="wh-cta wh-report-send" disabled={!ready}>
          {sending ? 'Sending…' : submitLabel}
        </button>
      </div>
    </form>
  );
};

export default ReportForm;
