import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../services/api';
import { Banner, Button, Card, EmptyState, Skeleton } from '../components/ui';

const MIN_LENGTH = 4;

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

  const fetchStudent = async () => {
    setLoadError('');

    try {
      const res = await API.get(`/parent/child/${id}`);
      setStudent(res.data.student);
      setHasPassword(res.data.hasPurchasePassword);
    } catch (err) {
      console.error(err);
      setLoadError(
        err.response
          ? err.response.data?.message || 'Unable to load student.'
          : "Couldn't reach the server. Check your connection."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchStudent();
  }, [id]);

  // Every submit here shares the same shape: validate, POST, report, go back.
  const submit = async (endpoint, body, validate) => {
    setError('');
    setSuccess('');

    const problem = validate();
    if (problem) return setError(problem);

    setSaving(true);

    try {
      await API.post(endpoint, { studentId: id, ...body });
      setSuccess('Purchase password updated successfully.');
      setTimeout(() => navigate(`/child/${id}`), 1200);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save password.');
      setSaving(false);
    }
  };

  const savePassword = () =>
    submit('/parent/set-purchase-password', { password }, () => {
      if (!password) return 'Please enter a password.';
      if (password.length < MIN_LENGTH)
        return `Password must be at least ${MIN_LENGTH} characters.`;
      if (password !== confirmPassword) return 'Passwords do not match.';
      return null;
    });

  const changePassword = () =>
    submit(
      '/parent/change-purchase-password',
      { currentPassword, newPassword },
      () => {
        if (!currentPassword) return 'Please enter the current password.';
        if (newPassword.length < MIN_LENGTH)
          return `Password must be at least ${MIN_LENGTH} characters.`;
        if (newPassword !== confirmNewPassword) return 'Passwords do not match.';
        return null;
      }
    );

  const resetPassword = () =>
    submit(
      '/parent/reset-purchase-password',
      { parentPassword: resetParentPassword, newPassword: resetPasswordValue },
      () => {
        if (!resetParentPassword) return 'Please enter your account password.';
        if (resetPasswordValue.length < MIN_LENGTH)
          return `Password must be at least ${MIN_LENGTH} characters.`;
        if (resetPasswordValue !== confirmResetPassword)
          return 'Passwords do not match.';
        return null;
      }
    );

  const toggle = (form) => {
    setOpenForm(openForm === form ? null : form);
    setError('');
    setSuccess('');
  };

  const field = (label, value, onChange, autoComplete = 'new-password') => (
    <div>
      <label className="field-label" htmlFor={label}>
        {label}
      </label>
      <input
        id={label}
        className="input"
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );

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
          <Banner variant="alert" icon="⚠️">
            {loadError}
          </Banner>
          <Button
            variant="ghost"
            onClick={fetchStudent}
            style={{ marginTop: 16 }}
          >
            Try again
          </Button>
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
        <Button
          variant="ghost"
          onClick={() => navigate(`/child/${id}`)}
          style={{ marginBottom: 20 }}
        >
          <span aria-hidden="true">←</span> Back
        </Button>

        <Card>
          <h1 className="page-title" style={{ fontSize: 24 }}>
            Purchase Password
          </h1>
          <p className="card-meta" style={{ fontSize: 14 }}>
            {student.name} · Grade {student.grade} · Room {student.hostelNumber}
          </p>

          <p
            style={{
              marginTop: 12,
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--muted)',
            }}
          >
            This password is entered at the counter to authorise a purchase from{' '}
            {student.name}&apos;s wallet.
          </p>

          {error && (
            <Banner variant="alert" icon="⚠️" style={{ marginTop: 20 }}>
              {error}
            </Banner>
          )}

          {success && (
            <Banner variant="success" icon="✅" style={{ marginTop: 20 }}>
              {success}
            </Banner>
          )}

          {!hasPassword ? (
            <div style={{ display: 'grid', gap: 16, marginTop: 24 }}>
              {field('Purchase Password', password, setPassword)}
              {field('Confirm Password', confirmPassword, setConfirmPassword)}

              <Button onClick={savePassword} disabled={saving} block>
                {saving ? 'Saving…' : 'Save Password'}
              </Button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
              <Button
                variant="ghost"
                block
                aria-expanded={openForm === 'change'}
                onClick={() => toggle('change')}
              >
                Change Password
              </Button>

              {openForm === 'change' && (
                <div style={{ display: 'grid', gap: 16, marginBottom: 4 }}>
                  {field(
                    'Current Password',
                    currentPassword,
                    setCurrentPassword,
                    'current-password'
                  )}
                  {field('New Password', newPassword, setNewPassword)}
                  {field(
                    'Confirm New Password',
                    confirmNewPassword,
                    setConfirmNewPassword
                  )}

                  <Button onClick={changePassword} disabled={saving} block>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </Button>
                </div>
              )}

              <Button
                variant="ghost"
                block
                aria-expanded={openForm === 'reset'}
                onClick={() => toggle('reset')}
              >
                Forgot Password / Reset
              </Button>

              {openForm === 'reset' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Confirm with your own account password to set a new purchase
                    password.
                  </p>

                  {field(
                    'Your Account Password',
                    resetParentPassword,
                    setResetParentPassword,
                    'current-password'
                  )}
                  {field('New Password', resetPasswordValue, setResetPasswordValue)}
                  {field(
                    'Confirm New Password',
                    confirmResetPassword,
                    setConfirmResetPassword
                  )}

                  <Button
                    variant="alert"
                    onClick={resetPassword}
                    disabled={saving}
                    block
                  >
                    {saving ? 'Resetting…' : 'Reset Password'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
