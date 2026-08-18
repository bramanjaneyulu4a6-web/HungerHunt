import { useEffect, useState } from 'react';
import API from '../services/api';
import { useNavigate, Link } from 'react-router-dom';
import { AuthField, AuthLayout, Banner, Button, PasswordField } from '../components/ui';
import {
  PASSWORD_MIN_LENGTH,
  emailProblem,
  passwordProblem,
  phoneProblem,
} from '../utils/validation';

export default function Register() {
  const [formData, setFormData] = useState({
    fatherName: '',
    parentPhoneNumber: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!success) return undefined;
    const timer = window.setTimeout(() => navigate('/login'), 1800);
    return () => window.clearTimeout(timer);
  }, [navigate, success]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Registration used to accept a one-character password, while the reset
    // that replaces it demanded six. Checked here so the parent is told which
    // field is wrong, and again on the server, which is what enforces it.
    const problem =
      (!formData.fatherName.trim() && "Please enter the father's name.") ||
      phoneProblem(formData.parentPhoneNumber) ||
      emailProblem(formData.email) ||
      passwordProblem(formData.password);

    if (problem) return setError(problem);

    setSubmitting(true);

    try {
      await API.post('/parent/register', formData);
      setSuccess('Account created. Taking you to sign in…');
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Verification failed. Ensure credentials match school records.'
      );
      setSubmitting(false);
    }
  };

  const update = (field) => (e) => {
    const value = field === 'parentPhoneNumber'
      ? e.target.value.replace(/\D/g, '').slice(0, 10)
      : e.target.value;
    setFormData({ ...formData, [field]: value });
  };

  return (
    <AuthLayout
      logo="/Logo.jpeg"
      eyebrow="Hunger Hunt Parent"
      title="Create Account"
      subtitle="Use the father's name and phone number registered with the school office"
      footer={
        <>
          Already registered? <Link to="/login">Login here</Link>
        </>
      }
    >
      {error && (
        <Banner variant="alert" icon="⚠️" style={{ marginBottom: 28 }}>
          {error}
        </Banner>
      )}

      {success && (
        <Banner variant="success" icon="✅" style={{ marginBottom: 28 }}>
          {success}
        </Banner>
      )}

      <form onSubmit={handleSubmit} className="auth-form">
        <PasswordField
          id="father-name"
          label="Father's Name"
          type="text"
          autoComplete="name"
          required
          placeholder="Enter registered father's name"
          value={formData.fatherName}
          onChange={update('fatherName')}
        />

        <AuthField
          id="phone"
          label="Registered Phone Number"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          required
          maxLength={10}
          placeholder="e.g. 9876543210"
          value={formData.parentPhoneNumber}
          onChange={update('parentPhoneNumber')}
        />

        <AuthField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          placeholder="Enter email (used for password reset)"
          value={formData.email}
          onChange={update('email')}
        />

        <AuthField
          id="password"
          label={`Set App Password (at least ${PASSWORD_MIN_LENGTH} characters)`}
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          placeholder="••••••••"
          value={formData.password}
          onChange={update('password')}
        />

        <Button
          type="submit"
          variant="dark"
          block
          className="auth-submit"
          disabled={submitting || Boolean(success)}
        >
          {submitting ? 'Verifying details…' : 'Create parent account'}
        </Button>
      </form>
    </AuthLayout>
  );
}
