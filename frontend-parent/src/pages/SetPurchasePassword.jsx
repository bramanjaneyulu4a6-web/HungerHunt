import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../services/api';
import { Banner, Button, Card, EmptyState, Skeleton } from '../components/ui';
import { PURCHASE_CODE_LENGTH, purchaseCodeProblem } from '../utils/validation';
import { ErrorFeedback } from '../components/error/ErrorFeedback';
import { presentError } from '../utils/errorPresentation';

export default function SetPurchasePassword() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [hasPassword, setHasPassword] = useState(false);

  // Which of the two secondary forms is open: 'change', 'reset', or null.
  const [openForm, setOpenForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [resetParentPassword, setResetParentPassword] = useState('');
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');

  useEffect(() => {
    if (!success) return undefined;
    const timer = window.setTimeout(() => navigate(`/child/${id}`), 1200);
    return () => window.clearTimeout(timer);
  }, [id, navigate, success]);

  // "Try again" bumps this to run the effect below again, so the request has a
  // single home and is abandoned with the screen that asked for it.
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt((n) => n + 1);

  useEffect(() => {
    // A reply for the student this screen has moved on from must not land.
    let ignore = false;

    const load = async () => {
      setLoading(true);
      setLoadError('');

      try {
        const res = await API.get(`/parent/child/${id}`);
        if (ignore) return;

        setStudent(res.data.student);
        setHasPassword(res.data.hasPurchasePassword);
      } catch (err) {
        if (ignore) return;

        console.error(err);
        setLoadError(
          err.response
            ? err.response.data?.message || 'Unable to load student.'
            : "Couldn't reach the server. Check your connection."
        );
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();

    return () => {
      ignore = true;
    };
  }, [id, attempt]);

  // Every submit here shares the same shape: validate, POST, report, go back.
  // Returns a form submit handler, so each flow is driven by its own <form>
  // and Enter works the same as the button.
  const submit = (endpoint, body, validate) => async (e) => {
    e.preventDefault();

    setError('');
    setSuccess('');

    const problem = validate();
    if (problem) return setError(problem);

    setSaving(true);

    try {
      await API.post(endpoint, { studentId: id, ...body });
      setSuccess('Purchase code updated successfully.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save the code.');
      setSaving(false);
    }
  };

  const savePassword = submit(
    '/parent/set-purchase-password',
    { password },
    () =>
      purchaseCodeProblem(password) ||
      (password !== confirmPassword ? 'The two codes do not match.' : null)
  );

  const changePassword = submit(
    '/parent/change-purchase-password',
    { currentPassword, newPassword },
    () =>
      // Both ends are four digits: a child's only secret is their code, and
      // there is no other shape of one to change from. A code predating the
      // rule cannot be entered here — Forgot Purchase Code is that route, and
      // it asks for the parent's own password instead.
      (!currentPassword ? 'Please enter the current code.' : null) ||
      purchaseCodeProblem(newPassword) ||
      (newPassword !== confirmNewPassword ? 'The two codes do not match.' : null)
  );

  const resetPassword = submit(
    '/parent/reset-purchase-password',
    { parentPassword: resetParentPassword, newPassword: resetPasswordValue },
    () =>
      (!resetParentPassword ? 'Please enter your account password.' : null) ||
      purchaseCodeProblem(resetPasswordValue) ||
      (resetPasswordValue !== confirmResetPassword
        ? 'The two codes do not match.'
        : null)
  );

  const toggle = (form) => {
    setOpenForm(openForm === form ? null : form);
    setError('');
    setSuccess('');
  };

  const field = (label, inputProps) => {
    // The label doubled as the id, which put spaces in it — legal enough that
    // browsers still pair them, but not a valid HTML id.
    const fieldId = label.toLowerCase().replace(/\s+/g, '-');

    return (
      <div>
        <label className="field-label" htmlFor={fieldId}>
          {label}
        </label>
        <input id={fieldId} className="input" {...inputProps} />
      </div>
    );
  };

  /* A code the parent is setting. The field says digits-only to the phone, so
     the number pad comes up instead of a keyboard, and non-digits are dropped
     as they are typed rather than rejected on save. Still masked: it is typed
     at a counter with a queue behind it. */
  const codeField = (label, value, onChange) => (
    <div className={error ? 'pin-field pin-error-shake' : 'pin-field'}>
      {field(label, {
        type: 'password',
        inputMode: 'numeric',
        autoComplete: 'new-password',
        maxLength: PURCHASE_CODE_LENGTH,
        placeholder: '••••',
        value,
        'aria-invalid': Boolean(error),
        onChange: (e) => {
          setError('');
          onChange(e.target.value.replace(/\D/g, '').slice(0, PURCHASE_CODE_LENGTH));
        },
      })}
      <div className="parent-pin-dots" aria-hidden="true">
        {Array.from({ length: PURCHASE_CODE_LENGTH }, (_, index) => (
          <i key={index} className={index < value.length ? 'is-filled' : ''} />
        ))}
      </div>
    </div>
  );

  /* The parent's own account password — the only other secret in the system,
     and the one that recovers a child's code. Unrestricted, because it is a
     password and not a code; nothing a student holds looks like this. */
  const accountPasswordField = (label, value, onChange) =>
    field(label, {
      type: 'password',
      autoComplete: 'current-password',
      value,
      onChange: (e) => onChange(e.target.value),
    });

  // Existing accounts may still have a legacy code containing more than four
  // digits or letters. The backend deliberately accepts that old value while
  // requiring the replacement to be a four-digit PIN, so the UI must not
  // prevent the parent from typing the current code here.
  const currentCodeField = (label, value, onChange) =>
    field(label, {
      type: 'password',
      inputMode: student?.purchaseCodeIsPin ? 'numeric' : 'text',
      autoComplete: 'current-password',
      maxLength: student?.purchaseCodeIsPin ? PURCHASE_CODE_LENGTH : undefined,
      placeholder: student?.purchaseCodeIsPin ? '••••' : 'Current code',
      value,
      onChange: (e) =>
        onChange(
          student?.purchaseCodeIsPin
            ? e.target.value.replace(/\D/g, '').slice(0, PURCHASE_CODE_LENGTH)
            : e.target.value
        ),
    });

  if (loading) {
    return (
      <div className="page">
        <Card style={{ maxWidth: 500, margin: '0 auto' }}>
          <Skeleton width="55%" height={24} />
          <Skeleton width="40%" height={14} style={{ marginTop: 12 }} />
          <Skeleton height={44} radius="var(--radius-sm)" style={{ marginTop: 24 }} />
          <Skeleton height={44} radius="var(--radius-sm)" style={{ marginTop: 16 }} />
        </Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page">
        <div style={{ maxWidth: 500, margin: '0 auto' }}>
          <ErrorFeedback issue={presentError({ request: true, message: loadError })} action={{ label: 'Try again', onClick: retry }} />
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="page">
        <div style={{ maxWidth: 500, margin: '0 auto' }}>
          <EmptyState icon="🔍" title="Student not found">
            This account may have been removed, or it isn&apos;t linked to your
            phone number.
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ maxWidth: 500, margin: '0 auto' }}>
        <Button variant="ghost" onClick={() => navigate(`/child/${id}`)} style={{ marginBottom: 20 }}>
          ← Back to {student.name}
        </Button>

        <Card>
          <h1 className="page-title" style={{ fontSize: 24 }}>
            Purchase code
          </h1>
          <p className="card-meta" style={{ fontSize: 14 }}>
            {student.name} · Grade {student.grade || '—'} · Room{' '}
            {student.hostelNumber || '—'}
          </p>

          <p
            style={{
              marginTop: 12,
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--muted)',
            }}
          >
            A {PURCHASE_CODE_LENGTH}-digit code {student.name} types at the
            counter to authorise a purchase from their wallet. Choose something
            they can remember without writing it down.
          </p>

          {/* Shown until this child is known to have a four-digit code — which
              they may already have, since nothing can read it back from the
              stored hash. Buying anything at the counter with four digits
              settles it, so this clears itself for most families without them
              doing a thing. */}
          {hasPassword && !student.purchaseCodeIsPin && (
            <Banner variant="warn" icon="🔢" style={{ marginTop: 20 }}>
              Purchase codes are now {PURCHASE_CODE_LENGTH} digits, and the
              counter takes nothing else. If {student.name} already uses a{' '}
              {PURCHASE_CODE_LENGTH}-digit code there is nothing to do. If
              theirs is longer or has letters in it, use{' '}
              <strong>Forgot purchase code</strong> below — it asks for your own
              account password, so you do not need the old one.
            </Banner>
          )}

          {error && (
            <ErrorFeedback issue={presentError({ status: 400, message: error })} level="inline" className="purchase-code-error" />
          )}

          {success && (
            <Banner variant="success" icon="✅" style={{ marginTop: 20 }}>
              {success}
            </Banner>
          )}

          {!hasPassword ? (
            <form
              onSubmit={savePassword}
              style={{ display: 'grid', gap: 16, marginTop: 24 }}
            >
              {codeField('Purchase Code', password, setPassword)}
              {codeField('Confirm Code', confirmPassword, setConfirmPassword)}

              <Button type="submit" disabled={saving} block>
                {saving ? 'Saving…' : 'Save Code'}
              </Button>
            </form>
          ) : (
            <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
              <Button
                variant="ghost"
                block
                aria-expanded={openForm === 'change'}
                onClick={() => toggle('change')}
              >
                Change code
              </Button>

              {openForm === 'change' && (
                <form
                  onSubmit={changePassword}
                  style={{ display: 'grid', gap: 16, marginBottom: 4 }}
                >
                  {currentCodeField('Current Code', currentPassword, setCurrentPassword)}
                  {codeField('New Code', newPassword, setNewPassword)}
                  {codeField(
                    'Confirm New Code',
                    confirmNewPassword,
                    setConfirmNewPassword
                  )}

                  <Button type="submit" disabled={saving} block>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </Button>
                </form>
              )}

              <Button
                variant="ghost"
                block
                aria-expanded={openForm === 'reset'}
                onClick={() => toggle('reset')}
              >
                Forgot purchase code?
              </Button>

              {openForm === 'reset' && (
                <form
                  onSubmit={resetPassword}
                  style={{ display: 'grid', gap: 16 }}
                >
                  <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Confirm with your own account password to set a new purchase
                    code.
                  </p>

                  {accountPasswordField(
                    'Your Account Password',
                    resetParentPassword,
                    setResetParentPassword
                  )}
                  {codeField('New Code', resetPasswordValue, setResetPasswordValue)}
                  {codeField(
                    'Confirm New Code',
                    confirmResetPassword,
                    setConfirmResetPassword
                  )}

                  <Button
                    type="submit"
                    variant="alert"
                    disabled={saving}
                    block
                  >
                    {saving ? 'Resetting…' : 'Reset Code'}
                  </Button>
                </form>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
