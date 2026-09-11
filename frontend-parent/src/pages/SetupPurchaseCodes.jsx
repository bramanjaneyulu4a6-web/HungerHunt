import { useState } from 'react';

import API from '../services/api';
import { Banner, Button, Card } from '../components/ui';
import { useAuth } from '../context/auth';
import { ErrorFeedback } from '../components/error/ErrorFeedback';
import { presentError } from '../utils/errorPresentation';
import { formatClass } from '../utils/format';
import { PURCHASE_CODE_LENGTH } from '../utils/validation';
import { purchaseCodeSetupProblem, purchaseCodeSetupSaves } from '../utils/purchaseCodeSetup';

/* The screen a parent cannot get past until every one of their children has a
   purchase code. It is reached on its own after first-time password setup, and
   by the gate in App.jsx on any later start where a child still has none.
 *
 * Nothing here is kept anywhere but component state, so a reload starts the
 * form over — deliberately. The children it asks about are re-read from the
 * server on that reload, so a code saved before the reload is simply no longer
 * asked for. */
export default function SetupPurchaseCodes() {
  const { codeSetup, refreshCodeSetup, logout } = useAuth();
  const children = codeSetup.pending;

  const [entries, setEntries] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState([]);

  const single = children.length === 1;

  const write = (id, part) => (event) => {
    const digits = event.target.value.replace(/\D/g, '').slice(0, PURCHASE_CODE_LENGTH);

    setError('');
    setEntries((current) => ({
      ...current,
      [id]: { ...current[id], [part]: digits },
    }));
  };

  const save = async (event) => {
    event.preventDefault();
    setError('');
    setSaved([]);

    const problem = purchaseCodeSetupProblem(children, entries);
    if (problem) return setError(problem);

    setSaving(true);

    /* One request per child, because the endpoint sets one code. Stop at the
       first refusal rather than pressing on: whatever it was — a code set from
       another device, a server having a bad minute — it is likely to happen to
       the next child too, and a list of four failures explains less than one.
       Codes already saved are real, so they are named before the error. */
    const done = [];

    try {
      for (const entry of purchaseCodeSetupSaves(children, entries)) {
        try {
          await API.post('/parent/set-purchase-password', {
            studentId: entry.studentId,
            password: entry.password,
          });
          done.push(entry.name);
        } catch (saveError) {
          setSaved(done);
          setError(
            saveError.response?.data?.message ||
              `${entry.name}'s code could not be saved. Please try again.`
          );
          return;
        }
      }
    } finally {
      /* Asked again either way. On success this is what opens the gate; after
         a partial failure it drops the children who are now done, so the form
         comes back asking only for the ones still missing a code.

         Left saving when every code landed: the screen is on its way out, and
         releasing the button would offer a second save of work already done.
         The gate takes the parent off this screen when the answer arrives —
         including when it cannot be asked, since the codes are saved either
         way. */
      if (done.length < children.length) setSaving(false);
      refreshCodeSetup();
    }
  };

  const codeBox = (child, part, label) => {
    const value = entries[child._id]?.[part] ?? '';
    const id = `${part}-${child._id}`;

    return (
      <div>
        <label className="field-label" htmlFor={id}>{label}</label>
        <input
          id={id}
          className="input"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={PURCHASE_CODE_LENGTH}
          placeholder="••••"
          value={value}
          onChange={write(child._id, part)}
        />
        <div className="parent-pin-dots" aria-hidden="true">
          {Array.from({ length: PURCHASE_CODE_LENGTH }, (_, index) => (
            <i key={index} className={index < value.length ? 'is-filled' : ''} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="page">
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <Card>
          <h1 className="page-title" style={{ fontSize: 24 }}>
            {single
              ? `Set ${children[0].name}'s purchase code`
              : 'Set your children’s purchase codes'}
          </h1>

          <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.55, color: 'var(--muted)' }}>
            {single
              ? `${children[0].name} types this ${PURCHASE_CODE_LENGTH}-digit code at the counter to pay from their wallet. Nothing can be bought without it, so choose something they can remember without writing it down.`
              : `Each child types their own ${PURCHASE_CODE_LENGTH}-digit code at the counter to pay from their wallet. Nothing can be bought without one, so choose codes they can remember without writing them down.`}
          </p>

          {saved.length > 0 && (
            <Banner variant="success" icon="✅" style={{ marginTop: 20 }}>
              Saved for {saved.join(', ')}. {saved.length === 1 ? 'That code is' : 'Those codes are'} set.
            </Banner>
          )}

          {error && (
            <ErrorFeedback
              issue={presentError({ status: 400, message: error })}
              level="inline"
              className="purchase-code-error"
            />
          )}

          <form onSubmit={save} style={{ marginTop: 8 }}>
            {children.map((child, index) => (
              <div
                key={child._id}
                style={{
                  display: 'grid',
                  gap: 16,
                  paddingTop: 24,
                  marginTop: index === 0 ? 0 : 24,
                  borderTop: index === 0 ? 'none' : '1px solid var(--line, rgba(0,0,0,.08))',
                }}
              >
                {!single && (
                  <div>
                    <h2 style={{ margin: 0, fontSize: 17 }}>{child.name}</h2>
                    <p className="card-meta" style={{ fontSize: 13 }}>
                      Class {formatClass(child) || '—'} · Room {child.roomNumber || '—'}
                    </p>
                  </div>
                )}

                {codeBox(child, 'code', single ? 'Purchase code' : `${child.name}’s code`)}
                {codeBox(child, 'confirm', 'Type it again')}
              </div>
            ))}

            <Button type="submit" disabled={saving} block style={{ marginTop: 28 }}>
              {saving
                ? 'Saving…'
                : single
                  ? 'Save code and continue'
                  : 'Save codes and continue'}
            </Button>
          </form>

          {/* The only other way off this screen. A parent who has come to the
              wrong account, or who wants to do this on another device, must be
              able to leave without force-quitting the app. */}
          <button
            type="button"
            className="auth-text-button"
            disabled={saving}
            onClick={() => logout()}
            style={{ marginTop: 18 }}
          >
            Sign out
          </button>
        </Card>
      </div>
    </div>
  );
}
