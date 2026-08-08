import { useAuth } from '../context/auth';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from './ui';

export default function Navbar() {
  const { parent, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    // Awaited so the device is unregistered before the token it needs is gone.
    await logout();
    navigate('/login');
  };

  return (
    <nav className="appbar">
      <Link to="/" className="appbar-brand">
        <span aria-hidden="true">👨‍👩‍👦</span> Parent Portal
      </Link>

      {parent && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* motherName was in the old fallback chain but no such field is
              stored on a parent, nor sent by the login response. */}
          <span className="appbar-user">
            Welcome, {parent.fatherName || 'Parent'}
          </span>

          {/* No unanswered count: it would mean this bar polling on every
              screen. A request announces itself with a notification, and this
              is the way back to one that was dismissed. */}
          <Button variant="ghost" to="/pending-orders">
            <span aria-hidden="true">🛒</span> Requests
          </Button>

          <Button variant="alert" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      )}
    </nav>
  );
}
