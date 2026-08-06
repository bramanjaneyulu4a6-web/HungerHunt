import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import API from '../services/api';
import { AuthField, AuthLayout, Banner, Button } from '../components/ui';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    setError('');
    setSubmitting(true);

    try {
      const res = await API.post(`/parent/reset-password/${token}`, {
        password,
      });

      setMsg(res.data.message || 'Password reset successfully!');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed');
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
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
        <AuthField
          id="new-password"
          label="New Password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
