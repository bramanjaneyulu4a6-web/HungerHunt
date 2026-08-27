import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { AuthField, AuthLayout, Banner, Button, PasswordField } from '../components/ui';
import { useAuth } from '../context/auth';
import API from '../services/api';
import { passwordProblem, phoneProblem } from '../utils/validation';

export default function Activate() {
  const [form, setForm] = useState({ parentPhoneNumber: '', activationCode: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const problem = phoneProblem(form.parentPhoneNumber)
      || (!/^\d{6}$/.test(form.activationCode) ? 'Enter the 6-digit activation code from the school office.' : null)
      || passwordProblem(form.password)
      || (form.password !== form.confirmPassword ? 'The passwords do not match.' : null);
    if (problem) return setError(problem);

    setSubmitting(true);
    try {
      const response = await API.post('/parent/activate', {
        parentPhoneNumber: form.parentPhoneNumber,
        activationCode: form.activationCode,
        password: form.password,
      });
      login(response.data.token, response.data.parent);
      navigate('/');
    } catch (activationError) {
      setError(activationError.response?.data?.message || 'Could not activate the account.');
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      logo="/Logo.jpeg"
      eyebrow="Hunger Hunt Parent"
      title="Activate your account"
      subtitle="Use the one-time code provided by the school office, then choose your password."
      footer={<>Already activated? <Link to="/login">Sign in</Link></>}
    >
      {error && <Banner variant="alert" icon="⚠️" style={{ marginBottom: 28 }}>{error}</Banner>}
      <form onSubmit={submit} className="auth-form">
        <AuthField
          id="activation-phone"
          label="Registered phone number"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          required
          maxLength={10}
          value={form.parentPhoneNumber}
          onChange={(event) => setForm({ ...form, parentPhoneNumber: event.target.value.replace(/\D/g, '').slice(0, 10) })}
        />
        <AuthField
          id="activation-code"
          label="One-time activation code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={6}
          placeholder="6-digit code"
          value={form.activationCode}
          onChange={(event) => setForm({ ...form, activationCode: event.target.value.replace(/\D/g, '').slice(0, 6) })}
        />
        <PasswordField
          id="activation-password"
          label="Create password"
          autoComplete="new-password"
          required
          minLength={6}
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
        />
        <PasswordField
          id="activation-confirm-password"
          label="Confirm password"
          autoComplete="new-password"
          required
          minLength={6}
          value={form.confirmPassword}
          onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
        />
        <Button type="submit" variant="dark" block className="auth-submit" disabled={submitting}>
          {submitting ? 'Activating…' : 'Activate and sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
}
