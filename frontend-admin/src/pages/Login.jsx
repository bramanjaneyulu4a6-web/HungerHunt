import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../utils/api';
import { AuthField, AuthLayout, Banner, Button } from '../components/ui';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Set by the 401 interceptor and by ProtectedRoute, so a day-old session says
  // so instead of dropping staff on a bare login screen with no explanation.
  const expired = searchParams.get('expired') === '1';

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const response = await api.post('/admin/login', { email, password });

      /* A non-admin's credentials are good — just good for a different
         terminal. Saying so at the door beats a dashboard of empty panels. */
      if (response.data.role && response.data.role !== 'admin') {
        setError(
          `This is a ${response.data.role} account. Sign in on the warehouse app instead.`
        );
        setSubmitting(false);
        return;
      }

      localStorage.setItem('adminToken', response.data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials');
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Admin Portal"
      subtitle="Sign in to access your dashboard"
      footer={
        <>
          New here? <Link to="/register">Register admin account</Link>
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

      <form onSubmit={handleLogin} className="auth-form">
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

        <AuthField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
};

export default Login;
