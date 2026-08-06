import { useState } from 'react';
import API from '../services/api';
import { useNavigate, Link } from 'react-router-dom';
import { AuthField, AuthLayout, Banner, Button } from '../components/ui';

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      await API.post('/parent/register', formData);
      setSuccess('Account created successfully! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Verification failed. Ensure credentials match school records.'
      );
      setSubmitting(false);
    }
  };

  const update = (field) => (e) =>
    setFormData({ ...formData, [field]: e.target.value });

  return (
    <AuthLayout
      title="Create Account"
      subtitle="Use the Father Name & Phone Number registered with the school office"
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
        <AuthField
          id="father-name"
          label="Father's Name (e.g., Stephen)"
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
          label="Set App Password"
          type="password"
          autoComplete="new-password"
          required
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
          {submitting ? 'Verifying…' : 'Verify & Register'}
        </Button>
      </form>
    </AuthLayout>
  );
}
