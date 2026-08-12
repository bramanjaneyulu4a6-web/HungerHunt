import { useState } from 'react';
import API from '../services/api';
import { Link } from 'react-router-dom';
import { AuthField, AuthLayout, Banner, Button } from '../components/ui';
import { emailProblem } from '../utils/validation';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    setError('');

    const problem = emailProblem(email);
    if (problem) return setError(problem);

    setSubmitting(true);

    try {
      const res = await API.post('/parent/forgot-password', { email });
      setMsg(res.data.message || 'Reset link sent successfully!');
    } catch (err) {
      setError(err.response?.data?.message || 'Error sending link');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Forgot Password"
      subtitle="Enter your email address to receive a secure password reset link"
      footer={
        <>
          Remembered your credentials? <Link to="/login">Back to Sign In</Link>
        </>
      }
    >
      {msg && (
        <Banner variant="success" icon="✅" style={{ marginBottom: 28 }}>
          {msg}
        </Banner>
      )}

      {error && (
        <Banner variant="alert" icon="⚠️" style={{ marginBottom: 28 }}>
          {error}
        </Banner>
      )}

      <form onSubmit={handleSubmit} className="auth-form">
        <AuthField
          id="email"
          label="Email Address"
          type="email"
          autoComplete="email"
          required
          placeholder="e.g. parent@example.com"
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
          {submitting ? 'Sending…' : 'Email reset link'}
        </Button>
      </form>
    </AuthLayout>
  );
}
