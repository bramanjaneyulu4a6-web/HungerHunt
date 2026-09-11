import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { AuthField, AuthLayout, Banner, Button, PasswordField } from '../components/ui';
import { useAuth } from '../context/auth';
import API from '../services/api';
import {
  clearPhoneVerification,
  confirmPhoneVerification,
  startPhoneVerification,
} from '../services/phoneVerification';
import { passwordProblem } from '../utils/validation';
import { BUSY_MESSAGE, useRetryCooldown } from '../utils/retryCooldown';

const PHONE_STORAGE_KEY = 'firstPasswordPhone';

const friendlyFirebaseError = (error) => {
  const code = error?.code || '';
  if (code.includes('invalid-verification-code')) return 'That verification code is not correct.';
  if (code.includes('code-expired') || code.includes('session-expired')) return 'That code has expired. Send a new one.';
  if (code.includes('too-many-requests') || code.includes('quota-exceeded')) return 'Too many attempts. Please wait before trying again.';
  if (code.includes('invalid-phone-number')) return 'The registered phone number is not valid.';
  return error?.message || 'Phone verification could not be completed.';
};

export default function FirstPassword() {
  const phone = sessionStorage.getItem(PHONE_STORAGE_KEY) || '';
  const [step, setStep] = useState('send');
  const [code, setCode] = useState('');
  const [idToken, setIdToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const cooldown = useRetryCooldown();

  useEffect(() => () => {
    clearPhoneVerification();
  }, []);

  if (!/^\d{10}$/.test(phone)) return <Navigate to="/login" replace />;

  const sendCode = async () => {
    setError('');
    setCode('');
    setSubmitting(true);
    try {
      const result = await startPhoneVerification(phone, 'send-phone-code');
      if (result.automaticallyVerified) {
        setIdToken(result.idToken);
        setStep('password');
      } else {
        setStep('code');
      }
    } catch (sendError) {
      setError(friendlyFirebaseError(sendError));
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code sent by SMS.');

    setSubmitting(true);
    try {
      setIdToken(await confirmPhoneVerification(code));
      setStep('password');
    } catch (verificationError) {
      setError(friendlyFirebaseError(verificationError));
    } finally {
      setSubmitting(false);
    }
  };

  const createPassword = async (event) => {
    event.preventDefault();
    setError('');
    cooldown.reset();
    const problem = passwordProblem(password)
      || (password !== confirmPassword ? 'The passwords do not match.' : null);
    if (problem) return setError(problem);

    setSubmitting(true);
    try {
      const response = await API.post('/parent/first-password', {
        parentPhoneNumber: phone,
        password,
        firebaseIdToken: idToken,
      });
      /* The account is created the moment the request succeeds — everything
         after this line is housekeeping and must not be able to turn the
         success into an error screen. So: sign in first, tidy up after, and
         clearPhoneVerification (which cannot throw) is not awaited. */
      login(response.data.token, response.data.parent);
      sessionStorage.removeItem(PHONE_STORAGE_KEY);
      clearPhoneVerification();
      navigate('/');
    } catch (createError) {
      /* 409: the account already has its password — this device lost a race
         with another, or a retry of a request that actually landed. Sending
         the parent back through SMS verification would loop forever (each
         lap ends in this same 409) and burn a text message every time. The
         password box on the sign-in screen is the way forward. */
      if (createError.response?.status === 409) {
        sessionStorage.removeItem(PHONE_STORAGE_KEY);
        clearPhoneVerification();
        navigate(`/login?password-set=1`, { replace: true });
        return;
      }
      /* 503: the server is merely busy, and this branch must come before the
         one below. That one sends the parent back to 'send' and throws the
         verified token away — a fresh SMS, and another wait, for a request
         that was never wrong. The phone is still verified; only the timing
         was bad, so keep the step and let them press the button again. */
      if (cooldown.startFrom(createError)) {
        setError(createError.response?.data?.message || BUSY_MESSAGE);
        return;
      }

      setError(createError.response?.data?.message || 'Could not create your password. Please verify your phone again.');
      setStep('send');
      setIdToken('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      logo="/Logo.jpeg"
      eyebrow="Hunger Hunt Parent"
      title="Create your password"
      subtitle={`First, verify the registered number ending in ${phone.slice(-4)}.`}
      footer={<>Wrong number? <Link to="/login">Return to sign in</Link></>}
    >
      {error && (
        <Banner
          variant={cooldown.busy ? 'warn' : 'alert'}
          icon={cooldown.busy ? '⏳' : '⚠️'}
          style={{ marginBottom: 28 }}
        >
          {error}
        </Banner>
      )}

      {step === 'send' && (
        <div className="auth-form">
          <p className="auth-step-copy">We’ll text a one-time verification code to +91 ••••••{phone.slice(-4)}.</p>
          <Button id="send-phone-code" type="button" variant="dark" block className="auth-submit" disabled={submitting} onClick={sendCode}>
            {submitting ? 'Sending code…' : 'Send verification code'}
          </Button>
        </div>
      )}

      {step === 'code' && (
        <form onSubmit={verifyCode} className="auth-form">
          <AuthField
            id="phone-code"
            label="Verification code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            maxLength={6}
            placeholder="6-digit code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <Button type="submit" variant="dark" block className="auth-submit" disabled={submitting || code.length !== 6}>
            {submitting ? 'Verifying…' : 'Verify code'}
          </Button>
          <button id="send-phone-code" className="auth-text-button" type="button" disabled={submitting} onClick={sendCode}>
            Send a new code
          </button>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={createPassword} className="auth-form auth-password-create">
          <Banner variant="success" icon="✓">Phone number verified</Banner>
          <PasswordField
            id="new-password"
            label="Create password"
            autoComplete="new-password"
            autoFocus
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <PasswordField
            id="confirm-password"
            label="Confirm password"
            autoComplete="new-password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <Button type="submit" variant="dark" block className="auth-submit" disabled={submitting || cooldown.waiting}>
            {cooldown.waiting
              ? `Try again in ${cooldown.secondsLeft}s`
              : submitting ? 'Creating password…' : 'Create password and sign in'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
