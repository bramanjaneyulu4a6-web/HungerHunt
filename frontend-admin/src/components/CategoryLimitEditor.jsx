import { useState } from 'react';

import { Button } from './ui';
import { LIMIT_PERIODS } from '../utils/categoryLimits';

const initial = (limit) => ({
  enabled: Boolean(limit?.enabled),
  quantity: limit?.quantity ? String(limit.quantity) : '',
  period: limit?.period || 'WEEKLY',
});

/* One per-student cap on a category or a sub-category: whether it is on, how
 * many, and over what period. It counts the student's total across every
 * product it covers, and only ever tightens a product's own cap — the
 * strictest cap is the one that binds (backend utils/purchaseLimits.js).
 *
 * Saved by its own button rather than on each keystroke, so a half-typed
 * number is never a live cap. Switching it off keeps the number, as a
 * product's cap does. Remount it (key) when the saved cap changes. */
export default function CategoryLimitEditor({ id, label, hint, limit, disabled = false, onSave }) {
  const [draft, setDraft] = useState(() => initial(limit));
  const [saving, setSaving] = useState(false);
  const saved = initial(limit);
  const dirty =
    draft.enabled !== saved.enabled ||
    (draft.enabled && (draft.quantity !== saved.quantity || draft.period !== saved.period));
  const quantity = Number(draft.quantity);
  const problem =
    draft.enabled && (!Number.isInteger(quantity) || quantity < 1)
      ? 'Enter a whole number of at least 1.'
      : '';

  const save = async (event) => {
    event.preventDefault();
    if (!dirty || problem || saving) return;
    setSaving(true);
    try {
      await onSave({
        enabled: draft.enabled,
        quantity: draft.quantity === '' ? 0 : quantity,
        period: draft.period,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="category-limit" onSubmit={save} aria-labelledby={`${id}-label`}>
      <label className="category-limit__switch">
        <input
          type="checkbox"
          checked={draft.enabled}
          disabled={disabled || saving}
          onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
        />
        <span>
          <strong id={`${id}-label`}>{label}</strong>
          {hint && <small>{hint}</small>}
        </span>
      </label>

      <div className="category-limit__fields">
        <label className="sr-only" htmlFor={`${id}-quantity`}>Maximum quantity</label>
        <input
          id={`${id}-quantity`}
          className={`input${problem ? ' field-has-error' : ''}`}
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          placeholder="Max"
          value={draft.quantity}
          disabled={disabled || saving || !draft.enabled}
          aria-invalid={Boolean(problem)}
          onChange={(event) => setDraft((current) => ({ ...current, quantity: event.target.value }))}
        />
        <label className="sr-only" htmlFor={`${id}-period`}>Counted</label>
        <select
          id={`${id}-period`}
          className="input"
          value={draft.period}
          disabled={disabled || saving || !draft.enabled}
          onChange={(event) => setDraft((current) => ({ ...current, period: event.target.value }))}
        >
          {LIMIT_PERIODS.map(([value, text]) => (
            <option key={value} value={value}>{text}</option>
          ))}
        </select>
        <Button type="submit" disabled={disabled || saving || !dirty || Boolean(problem)}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {problem && <p className="category-limit__error" role="alert">{problem}</p>}
    </form>
  );
}
