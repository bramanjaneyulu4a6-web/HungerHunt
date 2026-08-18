import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { AuthField, AuthLayout, Banner, Button } from '../components/ui';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      await api.post('/admin/forgot-password', { email });
      setMessage('If that email is registered, a reset link has been sent.');
    } catch (err) {
      setError(
        err.response?.data?.message || 'Something went wrong. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Reset Password"
      subtitle="Enter your admin email to receive a reset link"
      footer={
        <>
          Remember your password? <Link to="/login">Sign In</Link>
        </>
      }
    >
      {message && (
        <Banner variant="success" icon="📮" style={{ marginBottom: 28 }}>
          {message}
        </Banner>
      )}
      {error && (
        <Banner variant="alert" icon="⚠️" style={{ marginBottom: 28 }}>
          {error}
        </Banner>
      )}

      <form onSubmit={handleReset} className="auth-form">
        <AuthField
          id="email"
          label="Email Address"
          type="email"
          autoComplete="email"
          required
          placeholder="admin@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Button
          type="submit"
          variant="dark"
          block
          className="auth-submit"
          disabled={submitting}
        >
          {submitting ? 'Sending…' : 'Send Reset Link'}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default ForgotPassword;
