import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import API from '../services/api';
import { useAuth } from '../context/auth';
import Icon from '../components/Icon';
import { formatClass, formatINR } from '../utils/format';
import { Button, Card, PageHeader, PasswordField, Skeleton } from '../components/ui';

const POLICIES = [
  { to: '/privacy-policy', label: 'Privacy policy' },
  { to: '/terms-and-conditions', label: 'Terms and conditions' },
  { to: '/refund-policy', label: 'Refund policy' },
  { to: '/shipping-policy', label: 'Shipping policy' },
];

export default function Account() {
  const { parent, logout } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const dialogRef = useRef(null);
  const deleteButtonRef = useRef(null);

  // The same four-field children listing the accounts screen reads — this
  // page only adds the admission number to what that endpoint already sends.
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState('');
  const [studentsAttempt, setStudentsAttempt] = useState(0);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await API.get('/parent/dashboard');
        if (ignore) return;
        setStudents(response.data.children || []);
        setStudentsError('');
      } catch (err) {
        if (ignore) return;
        setStudentsError(err.response?.data?.message || "Couldn't load your students.");
      } finally {
        if (!ignore) setStudentsLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [studentsAttempt]);

  const retryStudents = () => {
    setStudentsError('');
    setStudentsLoading(true);
    setStudentsAttempt((value) => value + 1);
  };

  /* Hoisted above the effect and memoised so the effect can depend on it
     without being torn down and rebuilt on every render — rebuilding it would
     re-run `focusable()[0]?.focus()` and drag focus back to the password field
     after each keystroke. Every setter it closes over is stable, so the empty
     dependency list is honest. */
  const close = useCallback(() => {
    setConfirming(false);
    setPassword('');
    setError('');
  }, []);

  /* Same focus trap as the sign-out dialog in Navbar.jsx, for the same reason:
     on a phone this is a full-screen decision with no pointer guaranteed, and
     `aria-modal` only fences off the page once focus is actually inside. */
  useEffect(() => {
    if (!confirming) return undefined;

    const dialog = dialogRef.current;
    const trigger = deleteButtonRef.current;

    const focusable = () =>
      [...dialog.querySelectorAll('input, button, [href], [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.disabled);

    focusable()[0]?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        // `close`, not a bare setConfirming: leaving the password and the
        // rejection message behind means reopening shows a stale "incorrect"
        // over a prefilled field with Delete already enabled.
        close();
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
      // Hand focus back to what opened it. A successful deletion navigates
      // away, so on that path there is nothing left to focus and this is a
      // no-op.
      trigger?.focus();
    };
  }, [confirming, close]);

  const handleDelete = async () => {
    setDeleting(true);
    setError('');

    try {
      await API.delete('/parent/account', { data: { password } });
      // The token is already dead server-side; see AuthContext.logout.
      await logout({ sessionAlreadyEnded: true });
      navigate('/login?deleted=1', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't delete your account. Please try again.");
      setDeleting(false);
    }
  };

  if (!parent) return null;

  return (
    <div className="page">
      <PageHeader title="Your account" subtitle="Your details, your students, our policies, and how to leave." />

      <div className="account-stack">
      <Card>
        <h2 className="card-title">Your details</h2>
        <dl className="account-details">
          <div>
            <dt>Name</dt>
            <dd>{parent.fatherName || '—'}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{parent.phone || '—'}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{parent.email || '—'}</dd>
          </div>
        </dl>
        <p className="account-note">
          Your school keeps these details. Ask the office to change them.
        </p>
      </Card>

      <Card>
        <h2 className="card-title">Your students</h2>
        {studentsLoading && (
          <div className="account-students">
            <Skeleton height={92} radius={14} />
          </div>
        )}
        {!studentsLoading && studentsError && (
          <>
            <p className="account-note">{studentsError}</p>
            <Button variant="ghost" onClick={retryStudents} style={{ marginTop: 12 }}>
              Try again
            </Button>
          </>
        )}
        {!studentsLoading && !studentsError && students.length === 0 && (
          <p className="account-note">
            No students are linked to this account yet. Contact the school office to link one.
          </p>
        )}
        {!studentsLoading && !studentsError && students.length > 0 && (
          <div className="account-students">
            {students.map((child) => (
              <section key={child._id} className="account-student" aria-label={child.name}>
                <div className="account-student-head">
                  <span className="student-avatar" aria-hidden="true">
                    {child.name?.charAt(0).toUpperCase() || 'S'}
                  </span>
                  <strong>{child.name}</strong>
                  <Link
                    to={`/child/${child._id}`}
                    className="account-student-link"
                    aria-label={`View ${child.name}'s account`}
                  >
                    View account <Icon name="chevronRight" size={16} />
                  </Link>
                </div>
                <dl className="account-details">
                  <div>
                    <dt>Admission number</dt>
                    <dd>{child.admissionNumber || '—'}</dd>
                  </div>
                  <div>
                    <dt>Class</dt>
                    <dd>{formatClass(child) || '—'}</dd>
                  </div>
                  <div>
                    <dt>Room</dt>
                    <dd>{child.roomNumber || '—'}</dd>
                  </div>
                  <div>
                    <dt>Wallet balance</dt>
                    <dd>{formatINR(Number(child.pocketMoney || 0))}</dd>
                  </div>
                </dl>
              </section>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="card-title">Policies</h2>
        <ul className="account-policy-list">
          {POLICIES.map((policy) => (
            <li key={policy.to}>
              <Link to={policy.to}>
                {policy.label}
                <Icon name="chevronRight" size={18} />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="account-danger">
        <h2 className="card-title">Delete your account</h2>
        <p>
          This closes your Hunger Hunt account and signs you out everywhere. You’ll stop
          receiving notifications, and you won’t be able to see your children’s balances or
          approve their purchases.
        </p>
        <p>
          Your children keep their wallets and their purchase history — those belong to the
          school, not to this app. To come back, ask the office for a new invitation.
        </p>
        {/* Not the shared `Button`: it does not forward a ref, and the focus
            trap has to hand focus back to whatever opened the dialog. Same
            classes it would have produced. */}
        <button
          ref={deleteButtonRef}
          type="button"
          className="btn btn--danger"
          onClick={() => setConfirming(true)}
        >
          <Icon name="trash" size={18} /> Delete my account
        </button>
      </Card>
      </div>

      {confirming && (
        <div className="parent-modal-backdrop" onClick={close}>
          <div
            ref={dialogRef}
            className="parent-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="parent-modal-icon parent-modal-icon--alert" aria-hidden="true">
              <Icon name="trash" size={24} />
            </span>
            <h2 id="delete-account-title">Delete your account?</h2>
            <p>Enter your password to confirm. This cannot be undone from the app.</p>

            <PasswordField
              id="delete-account-password"
              label="Your password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
            />

            {error && <p className="account-dialog-error" role="alert">{error}</p>}

            <div className="parent-modal-actions">
              <Button variant="ghost" block disabled={deleting} onClick={close}>
                Keep my account
              </Button>
              <Button
                variant="danger"
                block
                disabled={deleting || !password}
                onClick={handleDelete}
              >
                {deleting ? 'Deleting…' : 'Delete account'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
