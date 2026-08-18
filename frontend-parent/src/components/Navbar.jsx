import { useEffect, useRef, useState } from 'react';
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
  const dialogRef = useRef(null);
  const logoutButtonRef = useRef(null);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    navigate('/login', { replace: true });
  };

  /* Opening the dialog is not the same as arriving in it. `aria-modal` only
     fences the rest of the page off from a screen reader once focus is
     actually inside, and without that focus a keyboard tab walks the app bar
     and the bottom nav first and reaches the buttons behind the backdrop
     afterwards. On a phone the app bar holds the only way to sign out, so this
     is the dialog that has to work with no pointer at all. */
  useEffect(() => {
    if (!confirmingLogout) return undefined;

    const dialog = dialogRef.current;
    const trigger = logoutButtonRef.current;

    const focusable = () =>
      [...dialog.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.disabled);

    focusable()[0]?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setConfirmingLogout(false);
        return;
      }

      if (event.key !== 'Tab') return;

      const items = focusable();
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];

      // Wrap at both ends rather than letting Tab out into the page behind.
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Hand focus back to what opened it. Signing out unmounts the whole bar,
      // so on that path there is nothing left to focus and this does nothing.
      trigger?.focus();
    };
  }, [confirmingLogout]);

  if (!parent) return null;

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
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
            <Icon name="home" size={18} /> Dashboard
          </NavLink>
          <NavLink to="/accounts" className={navClass}>
            <Icon name="user" size={18} /> Accounts
          </NavLink>
        </nav>

        <div className="parent-account">
          <span className="parent-account-avatar" aria-hidden="true">
            {(parent.fatherName || 'P').charAt(0).toUpperCase()}
          </span>
          <span className="parent-account-name">{parent.fatherName || 'Parent'}</span>
          <button
            ref={logoutButtonRef}
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
          <Icon name="home" size={21} /> <span>Dashboard</span>
        </NavLink>
        <NavLink to="/accounts" className={navClass}>
          <Icon name="user" size={21} /> <span>Accounts</span>
        </NavLink>
      </nav>

      {confirmingLogout && (
        <div className="parent-modal-backdrop" onClick={() => setConfirmingLogout(false)}>
          <div
            ref={dialogRef}
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
