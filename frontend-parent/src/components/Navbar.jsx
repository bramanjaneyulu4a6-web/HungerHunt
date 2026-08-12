import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth';
import Icon from './Icon';
import { Button } from './ui';

const navClass = ({ isActive }) =>
  `parent-nav-link${isActive ? ' parent-nav-link--active' : ''}`;

export default function Navbar() {
  const { parent, logout } = useAuth();
  const navigate = useNavigate();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    navigate('/login', { replace: true });
  };

  if (!parent) return null;

  return (
    <>
      <header className="parent-appbar">
        <NavLink to="/" className="parent-brand" aria-label="Hunger Hunt home">
          <img src="/Logo.jpeg" alt="" />
          <span>
            <b>Hunger Hunt</b>
            <small>Parent</small>
          </span>
        </NavLink>

        <nav className="parent-desktop-nav" aria-label="Primary navigation">
          <NavLink to="/" end className={navClass}>
            <Icon name="home" size={18} /> Accounts
          </NavLink>
          <NavLink to="/pending-orders" className={navClass}>
            <Icon name="cart" size={18} /> Approvals
          </NavLink>
        </nav>

        <div className="parent-account">
          <span className="parent-account-avatar" aria-hidden="true">
            {(parent.fatherName || 'P').charAt(0).toUpperCase()}
          </span>
          <span className="parent-account-name">{parent.fatherName || 'Parent'}</span>
          <button
            type="button"
            className="parent-logout"
            onClick={() => setConfirmingLogout(true)}
            aria-label="Sign out"
          >
            <Icon name="logout" size={19} />
          </button>
        </div>
      </header>

      <nav className="parent-bottom-nav" aria-label="Primary navigation">
        <NavLink to="/" end className={navClass}>
          <Icon name="home" size={21} /> <span>Accounts</span>
        </NavLink>
        <NavLink to="/pending-orders" className={navClass}>
          <Icon name="cart" size={21} /> <span>Approvals</span>
        </NavLink>
        <button type="button" className="parent-nav-link" onClick={() => setConfirmingLogout(true)}>
          <Icon name="logout" size={21} /> <span>Sign out</span>
        </button>
      </nav>

      {confirmingLogout && (
        <div className="parent-modal-backdrop" onClick={() => setConfirmingLogout(false)}>
          <div
            className="parent-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="logout-title"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="parent-modal-icon parent-modal-icon--alert" aria-hidden="true">
              <Icon name="logout" size={24} />
            </span>
            <h2 id="logout-title">Sign out of Hunger Hunt?</h2>
            <p>You’ll stop receiving account notifications on this device until you sign in again.</p>
            <div className="parent-modal-actions">
              <Button variant="ghost" block disabled={loggingOut} onClick={() => setConfirmingLogout(false)}>
                Stay signed in
              </Button>
              <Button variant="alert" block disabled={loggingOut} onClick={handleLogout}>
                {loggingOut ? 'Signing out…' : 'Sign out'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
