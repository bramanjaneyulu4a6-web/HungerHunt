import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { AuthField, AuthLayout, Banner, Button } from '../components/ui';
import { isLiveToken } from '../utils/session';
import { digitsOnly, numericFieldProps } from '../utils/numericInput';

const Register = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '', phone: '', email: '', password: '', role: 'admin', hostelId: '',
  });
  const [hostels, setHostels] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /* This screen serves two occasions. Reached without a token it is the very
     first account being created, which the server will make an admin whatever
     is asked for — there would otherwise be nobody left who could create one.
     Reached by a signed-in admin it is how the other accounts get made, and
     that is the only time the choice means anything.

     An expired token is not a signed-in admin: offering the choice on the
     strength of one would present a role picker whose submission the server is
     about to refuse. */
  const canChooseRole = isLiveToken(localStorage.getItem('adminToken'));

  useEffect(() => {
    if (!canChooseRole) return;
    api.get('/hostels?active=1')
      .then((response) => setHostels(response.data))
      .catch(() => setError('Could not load hostels. Add a hostel before creating a caretaker.'));
  }, [canChooseRole]);

  const handleChange = (e) => {
    // The phone box filters here rather than in AuthField: that component is
    // one of the files kept byte-identical across all four frontends, and only
    // this one has a digits-only field to filter.
    const value = e.target.name === 'phone'
      ? digitsOnly(e.target.value, 10)
      : e.target.value;
    const next = { ...formData, [e.target.name]: value };
    if (e.target.name === 'role' && e.target.value !== 'caretaker') next.hostelId = '';
    setFormData(next);
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
          ? 'Create an account for the back office, warehouse or a hostel'
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
          id="name"
          label="Full Name"
          type="text"
          name="name"
          autoComplete="name"
          required
          placeholder="Priya Sharma"
          value={formData.name}
          onChange={handleChange}
        />

        <AuthField
          id="phone"
          label="Phone Number"
          name="phone"
          required
          placeholder="9876543210"
          value={formData.phone}
          onChange={handleChange}
          {...numericFieldProps(10, 'tel')}
        />

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
              <option value="warehouse">Warehouse — goods in only</option>
              <option value="caretaker">Caretaker — one hostel’s deliveries</option>
            </select>

            <p className="auth-hint">
              {formData.role === 'warehouse'
                ? 'Can raise purchase orders and receive deliveries in the warehouse app. Cannot touch students, wallets or prices.'
                : formData.role === 'caretaker'
                  ? 'Can see packages on the way to one hostel and confirm delivery. Cannot access stock, suppliers, orders or prices.'
                : 'Full access, including student records, wallet top-ups, billing and creating other accounts.'}
            </p>
          </div>
        )}

        {canChooseRole && formData.role === 'caretaker' && (
          <div className="auth-field">
            <label className="auth-label" htmlFor="hostelId">Assigned hostel</label>
            <select id="hostelId" name="hostelId" className="auth-input" required
              value={formData.hostelId} onChange={handleChange}>
              <option value="">Choose a hostel</option>
              {hostels.map((hostel) => (
                <option key={hostel._id} value={hostel._id}>{hostel.code}{hostel.name ? ` — ${hostel.name}` : ''}</option>
              ))}
            </select>
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
