import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import API from '../services/api';
import { AuthLayout, Banner, Button, PasswordField } from '../components/ui';
import { PASSWORD_MIN_LENGTH, passwordProblem } from '../utils/validation';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!msg) return undefined;
    const timer = window.setTimeout(() => navigate('/login'), 1800);
    return () => window.clearTimeout(timer);
  }, [msg, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    setError('');

    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirmPassword) return setError('The two passwords do not match.');

    setSubmitting(true);

    try {
      const res = await API.post(`/parent/reset-password/${token}`, {
        password,
      });

      setMsg(res.data.message || 'Password reset successfully!');
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed');
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      logo="/Logo.jpeg"
      eyebrow="Hunger Hunt Parent"
      title="Reset Password"
      subtitle="Choose a secure, strong password to regain access to your account"
      footer={
        <>
          Cancel and return to <Link to="/login">Sign In</Link>
        </>
      }
    >
      {msg && (
        <Banner variant="success" icon="✅" style={{ marginBottom: 28 }}>
          {msg} Redirecting to login...
        </Banner>
      )}

      {error && (
        <Banner variant="alert" icon="⚠️" style={{ marginBottom: 28 }}>
          {error}
        </Banner>
      )}

      <form onSubmit={handleSubmit} className="auth-form">
        <PasswordField
          id="new-password"
          label={`New Password (at least ${PASSWORD_MIN_LENGTH} characters)`}
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <PasswordField
          id="confirm-password"
          label="Confirm new password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        <Button
          type="submit"
          variant="dark"
          block
          className="auth-submit"
          disabled={submitting || Boolean(msg)}
        >
          {submitting ? 'Resetting…' : 'Reset Password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
