import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { AuthField, AuthLayout, Banner, Button } from '../components/ui';

const Register = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({ email: '', password: '', role: 'admin' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /* This screen serves two occasions. Reached without a token it is the very
     first account being created, which the server will make an admin whatever
     is asked for — there would otherwise be nobody left who could create one.
     Reached by a signed-in admin it is how the other accounts get made, and
     that is the only time the choice means anything. */
  const canChooseRole = Boolean(localStorage.getItem('adminToken'));

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Same floor the reset-password screen enforces — without it an admin
    // could register a password that screen would refuse to set.
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await api.post('/admin/register', formData);
      setSuccess(res.data.message);

      // An admin creating an account for somebody else is still signed in and
      // has no reason to be sent to a login screen; only the bootstrap case does.
      setTimeout(() => {
        navigate(canChooseRole ? '/dashboard' : '/login');
      }, 1200);
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title={canChooseRole ? 'New Account' : 'Admin Registration'}
      subtitle={
        canChooseRole
          ? 'Create an account for the back office or the till'
          : 'Create the first admin account'
      }
      footer={
        <>
          Already have an account? <Link to="/login">Sign In</Link>
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
          id="email"
          label="Email Address"
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="admin@email.com"
          value={formData.email}
          onChange={handleChange}
        />

        <AuthField
          id="password"
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          placeholder="••••••••"
          value={formData.password}
          onChange={handleChange}
        />

        {canChooseRole && (
          <div className="auth-field">
            <label className="auth-label" htmlFor="role">
              Account type
            </label>

            <select
              id="role"
              name="role"
              className="auth-input"
              value={formData.role}
              onChange={handleChange}
            >
              <option value="admin">Admin — full back office</option>
              <option value="cashier">Cashier — till only</option>
              <option value="warehouse">Warehouse — goods in only</option>
            </select>

            <p className="auth-hint">
              {formData.role === 'cashier'
                ? 'Can look up students and take payments on the kiosk. Cannot change prices, stock, student records or wallets.'
                : formData.role === 'warehouse'
                ? 'Can raise purchase orders and receive deliveries in the warehouse app. Cannot touch students, wallets, prices or the till.'
                : 'Full access, including student records, wallet top-ups and creating other accounts.'}
            </p>
          </div>
        )}

        <Button
          type="submit"
          variant="dark"
          block
          className="auth-submit"
          disabled={submitting}
        >
          {submitting ? 'Creating account…' : 'Create Account'}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default Register;
