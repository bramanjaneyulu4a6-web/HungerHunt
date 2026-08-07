import { useState } from 'react';
import { useAuth } from '../context/auth';
import API from '../services/api';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { AuthField, AuthLayout, Banner, Button } from '../components/ui';

export default function Login() {
  const [formData, setFormData] = useState({
    parentPhoneNumber: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Set by the 401 interceptor, so an expired session says so instead of
  // dropping the parent on a bare login screen with no explanation.
  const expired = searchParams.get('expired') === '1';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await API.post('/parent/login', formData);

      login(res.data.token, res.data.parent);

      // Push registration is not kicked off here: App watches for a signed-in
      // parent and starts it, which covers this login and every later start
      // that restores the session.
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials');
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Parent Login"
      subtitle="Enter your phone number and password to access your account"
      footer={
        <>
          New here? <Link to="/register">Register account</Link>
        </>
      }
    >
      {expired && !error && (
        <Banner variant="warn" icon="🔒" style={{ marginBottom: 28 }}>
          Your session has expired. Please sign in again.
        </Banner>
      )}

      {error && (
        <Banner variant="alert" icon="⚠️" style={{ marginBottom: 28 }}>
          {error}
        </Banner>
      )}

      <form onSubmit={handleSubmit} className="auth-form">
        <AuthField
          id="phone"
          label="Phone Number"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          required
          placeholder="e.g. 9876543210"
          value={formData.parentPhoneNumber}
          onChange={(e) =>
            setFormData({ ...formData, parentPhoneNumber: e.target.value })
          }
        />

        <AuthField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          value={formData.password}
          onChange={(e) =>
            setFormData({ ...formData, password: e.target.value })
          }
          aside={
            <Link to="/forgot-password" className="auth-link">
              Forgot Password?
            </Link>
          }
        />

        <Button
          type="submit"
          variant="dark"
          block
          className="auth-submit"
          disabled={submitting}
        >
          {submitting ? 'Signing in…' : 'Sign In'}
        </Button>
      </form>
    </AuthLayout>
  );
}
