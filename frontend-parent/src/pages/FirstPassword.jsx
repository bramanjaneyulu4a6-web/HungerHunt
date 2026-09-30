import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { AuthField, AuthLayout, Banner, Button, PasswordField } from '../components/ui';
import { useAuth } from '../context/auth';
import API from '../services/api';
import {
  clearPhoneVerification,
  confirmPhoneVerification,
  friendlyFirebaseError,
  startPhoneVerification,
} from '../services/phoneVerification';
import { passwordProblem } from '../utils/validation';
import { BUSY_MESSAGE, useRetryCooldown } from '../utils/retryCooldown';
import {
  clearPendingFirstPasswordPhone,
  pendingFirstPasswordPhone,
} from '../utils/pendingFirstPassword';

/* The sign-in screen sends the first code before navigating here, and this
   screen's unmount clears that verification. StrictMode runs a mount's cleanup
   and effect back to back, which would throw the just-sent code away before
   the parent could type it; deferring the clear lets the remount cancel it. */
let pendingClear;

export default function FirstPassword() {
  /* Held in memory by the sign-in screen, so a reload arrives here with
     nothing and the guard below sends the parent back to the phone number to
     start over. Which is the intention: the verification token went with the
     reloaded page and the account still has no password, so there is no
     half-finished setup to resume — see utils/pendingFirstPassword. */
  const phone = pendingFirstPasswordPhone();
  // Android can verify the number itself while the code is being sent, in
  // which case sign-in hands the token over and there is no code to type.
  const handedToken = useLocation().state?.idToken || '';
  const [step, setStep] = useState(handedToken ? 'password' : 'code');
  const [code, setCode] = useState('');
  const [idToken, setIdToken] = useState(handedToken);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const cooldown = useRetryCooldown();

  useEffect(() => {
    clearTimeout(pendingClear);
    return () => {
      pendingClear = setTimeout(clearPhoneVerification, 0);
    };
  }, []);

  if (!/^\d{10}$/.test(phone)) return <Navigate to="/login" replace />;

  const sendCode = async () => {
    setError('');
    setCode('');
    setSubmitting(true);
    try {
      const result = await startPhoneVerification(phone, 'phone-code-recaptcha');
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
      clearPendingFirstPasswordPhone();
      clearPhoneVerification();
      /* Straight to the purchase codes, which every child needs before this
         parent can use the app. Navigating to '/' would land on the same
         screen by way of the gate in App; naming it here means the parent
         never sees a dashboard flash past. */
      navigate('/setup-purchase-codes', { replace: true });
    } catch (createError) {
      /* 409: the account already has its password — this device lost a race
         with another, or a retry of a request that actually landed. Sending
         the parent back through SMS verification would loop forever (each
         lap ends in this same 409) and burn a text message every time. The
         password box on the sign-in screen is the way forward. */
      if (createError.response?.status === 409) {
        clearPendingFirstPasswordPhone();
        clearPhoneVerification();
        navigate(`/login?password-set=1`, { replace: true });
        return;
      }
      /* 503: the server is merely busy, and this branch must come before the
         one below. That one sends the parent back to 'code' and throws the
         verified token away — a fresh SMS, and another wait, for a request
         that was never wrong. The phone is still verified; only the timing
         was bad, so keep the step and let them press the button again. */
      if (cooldown.startFrom(createError)) {
        setError(createError.response?.data?.message || BUSY_MESSAGE);
        return;
      }

      setError(createError.response?.data?.message || 'Could not create your password. Send a new code to verify your phone again.');
      setStep('code');
      setCode('');
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
      subtitle={`Enter the code we texted to the registered number ending in ${phone.slice(-4)}.`}
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
          <button className="auth-text-button" type="button" disabled={submitting} onClick={sendCode}>
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

      <div id="phone-code-recaptcha" />
    </AuthLayout>
  );
}
