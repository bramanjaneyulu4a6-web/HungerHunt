import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import { AuthField, AuthLayout, Banner, Button } from '../components/ui';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const response = await api.post('/admin/login', { email, password });

      /* A cashier's credentials are good — they are just good for the till.
         Signing them in here would work, in the sense that they would reach a
         dashboard where every panel came back empty and every action was
         refused. Saying so at the door is the only version of this that
         explains itself. */
      if (response.data.role === 'cashier') {
        setError('This is a till account. Sign in on the kiosk instead.');
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
