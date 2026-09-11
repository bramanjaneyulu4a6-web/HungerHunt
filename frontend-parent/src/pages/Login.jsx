import { useState } from 'react';
import { useAuth } from '../context/auth';
import API from '../services/api';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { AuthField, AuthLayout, Banner, Button, PasswordField } from '../components/ui';
import { phoneProblem } from '../utils/validation';
import { BUSY_MESSAGE, useRetryCooldown } from '../utils/retryCooldown';

export default function Login() {
  const [stage, setStage] = useState('phone');
  const [formData, setFormData] = useState({
    parentPhoneNumber: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Holds the button for a few seconds when the server says it is busy, so a
  // queue of parents does not turn into a queue of retries.
  const cooldown = useRetryCooldown();

  // Set by the 401 interceptor, so an expired session says so instead of
  // dropping the parent on a bare login screen with no explanation.
  const expired = searchParams.get('expired') === '1';

  // Set by the Account screen after a successful deletion, so the parent lands
  // on a sentence about what they just did rather than the expired-session one.
  const deleted = searchParams.get('deleted') === '1';

  // Set by the create-password screen when the account turned out to already
  // have its password (a lost race with another device, or a retried request
  // that had landed). The way in is the password box below, not another SMS.
  const passwordSet = searchParams.get('password-set') === '1';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    cooldown.reset();

    const problem = phoneProblem(formData.parentPhoneNumber);
    if (problem) return setError(problem);

    if (stage === 'password' && !formData.password) return setError('Enter your password.');

    setSubmitting(true);

    try {
      if (stage === 'phone') {
        const response = await API.post('/parent/login-step', {
          parentPhoneNumber: formData.parentPhoneNumber,
        });

        if (response.data.next === 'VERIFY_PHONE') {
          sessionStorage.setItem('firstPasswordPhone', formData.parentPhoneNumber);
          navigate('/create-password');
          return;
        }

        // No account behind this number (never registered, or archived by the
        // school or the parent). A password box would be a dead end, so say so
        // here and leave the parent on the phone step.
        if (response.data.next === 'NO_ACCOUNT') {
          setError('Invalid credentials — please contact the school office.');
          setSubmitting(false);
          return;
        }

        setStage('password');
        setSubmitting(false);
        return;
      }

      const res = await API.post('/parent/login', formData);

      login(res.data.token, res.data.parent);

      // Push registration is not kicked off here: App watches for a signed-in
      // parent and starts it, which covers this login and every later start
      // that restores the session.
      navigate('/');
    } catch (err) {
      /* A busy server is not a bad password. Saying "Invalid credentials"
         here would send a parent to reset a password that was always right. */
      if (cooldown.startFrom(err)) {
        setError(err.response?.data?.message || BUSY_MESSAGE);
        setSubmitting(false);
        return;
      }

      setError(err.response?.data?.message || 'Invalid credentials');
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      logo="/Logo.jpeg"
      eyebrow="Hunger Hunt Parent"
      title="Parent Login"
      subtitle={stage === 'phone' ? 'Enter your registered phone number to continue' : 'Enter your password to access your account'}
      footer={
        <span className="auth-footer-stack">
          <span className="auth-policy-links">
            <Link to="/terms-and-conditions">Terms</Link>
            <Link to="/privacy-policy">Privacy</Link>
            <Link to="/refund-policy">Refunds</Link>
            <Link to="/shipping-policy">Shipping</Link>
          </span>
        </span>
      }
    >
      {expired && !error && (
        <Banner variant="warn" icon="🔒" style={{ marginBottom: 28 }}>
          Your session has expired. Please sign in again.
        </Banner>
      )}

      {deleted && !error && (
        <Banner variant="success" icon="✅" style={{ marginBottom: 28 }}>
          Your account has been deleted. Ask your school office if you want it back.
        </Banner>
      )}

      {passwordSet && !error && (
        <Banner variant="success" icon="🔑" style={{ marginBottom: 28 }}>
          This account already has a password. Sign in with it below, or use
          &ldquo;Forgot password?&rdquo; if you don&apos;t know it.
        </Banner>
      )}

      {error && (
        <Banner
          variant={cooldown.busy ? 'warn' : 'alert'}
          icon={cooldown.busy ? '⏳' : '⚠️'}
          style={{ marginBottom: 28 }}
        >
          {error}
        </Banner>
      )}

      <form onSubmit={handleSubmit} className="auth-form login-form">
        <AuthField
          id="phone"
          label="Phone Number"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          required
          readOnly={stage === 'password'}
          placeholder="e.g. 9876543210"
          value={formData.parentPhoneNumber}
          maxLength={10}
          onChange={(e) => setFormData({
            ...formData,
            parentPhoneNumber: e.target.value.replace(/\D/g, '').slice(0, 10),
          })}
          aside={stage === 'password' ? (
            <button
              type="button"
              className="auth-inline-button"
              onClick={() => {
                setStage('phone');
                setFormData({ ...formData, password: '' });
                setError('');
              }}
            >
              Edit
            </button>
          ) : null}
        />

        {stage === 'password' && (
          <div className="login-password-reveal">
            <PasswordField
              id="password"
              label="Password"
              autoComplete="current-password"
              autoFocus
              required
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              aside={<Link to="/forgot-password" className="auth-link">Forgot password?</Link>}
            />
          </div>
        )}

        <Button
          type="submit"
          variant="dark"
          block
          className="auth-submit"
          disabled={submitting || cooldown.waiting || (stage === 'phone' && formData.parentPhoneNumber.length !== 10)}
        >
          {cooldown.waiting
            ? `Try again in ${cooldown.secondsLeft}s`
            : submitting
              ? (stage === 'phone' ? 'Checking…' : 'Signing in…')
              : (stage === 'phone' ? 'Continue' : 'Sign in securely')}
        </Button>
      </form>
    </AuthLayout>
  );
}
