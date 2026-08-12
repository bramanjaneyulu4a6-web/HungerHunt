import { useState, useEffect } from 'react';
import API from '../services/api';
import { PUSH_EVENT } from '../utils/events';
import { formatINR } from '../utils/format';
import {
  AnimateIn,
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
} from '../components/ui';
import Icon from '../components/Icon';

const LOW_BALANCE = 500;

const DashboardSkeleton = () => (
  <div className="card-grid">
    {[0, 1].map((i) => (
      <Card key={i}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div style={{ flex: 1 }}>
            <Skeleton width="45%" height={20} />
            <Skeleton width="65%" height={13} style={{ marginTop: 10 }} />
          </div>
          <Skeleton width={92} height={30} radius="var(--radius-pill)" />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Skeleton height={44} radius="var(--radius)" />
          <Skeleton height={44} radius="var(--radius)" />
        </div>
      </Card>
    ))}
  </div>
);

const Dashboard = () => {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // "Try again" bumps this to run the effect below again. The request lives in
  // the effect that owns it rather than beside it, so there is one copy of the
  // fetch and it is always torn down with the screen that started it.
  const [attempt, setAttempt] = useState(0);
  const retry = () => {
    setLoading(true);
    setAttempt((n) => n + 1);
  };

  useEffect(() => {
    // A reply that arrives after this effect is cleaned up belongs to a screen
    // that is already gone, and must not set state on it.
    let ignore = false;

    const load = async () => {
      try {
        const res = await API.get('/parent/dashboard');
        if (ignore) return;

        setChildren(res.data.children || []);
        setError('');
      } catch (err) {
        if (ignore) return;

        // Previously this only reached the console, so a failed load was
        // indistinguishable from a parent with no children linked.
        console.error('Error loading linked students:', err);
        setError(
          err.response?.data?.message ||
            "Couldn't load your children's accounts. Check your connection."
        );
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();

    // Balances change from recharges and purchases made elsewhere.
    window.addEventListener(PUSH_EVENT, load);
    window.addEventListener('focus', load);

    return () => {
      ignore = true;
      window.removeEventListener(PUSH_EVENT, load);
      window.removeEventListener('focus', load);
    };
  }, [attempt]);

  return (
    <div className="page">
      <PageHeader
        title="Your children"
        subtitle="Balances, purchase history and spending controls—all in one place."
      />

      {loading && <DashboardSkeleton />}

      {!loading && error && (
        <Banner variant="alert" icon="⚠️">
          {error}{' '}
          <button type="button" className="link-button" onClick={retry}>
            Try again
          </button>
        </Banner>
      )}

      {!loading && !error && children.length === 0 && (
        <EmptyState icon="🎒" title="No students linked yet">
          We couldn&apos;t find any students registered to your phone number.
          Please contact the school office to link your child&apos;s records.
        </EmptyState>
      )}

      {!loading && !error && children.length > 0 && (
        <div className="card-grid">
          {children.map((child, i) => {
            const balance = child.pocketMoney || 0;

            return (
              <AnimateIn key={child._id} index={i}>
                <Card
                  className="student-card"
                  style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
                >
                  <div className="student-card-head">
                    <div className="student-identity">
                      <span className="student-avatar" aria-hidden="true">
                        {child.name?.charAt(0).toUpperCase() || 'S'}
                      </span>
                      <div>
                        <h2 className="card-title">{child.name}</h2>
                        <p className="student-meta">
                          Grade {child.grade || '—'} · Room {child.hostelNumber || '—'}
                        </p>
                      </div>
                    </div>

                    <Badge variant={balance > LOW_BALANCE ? 'success' : 'alert'}>
                      {balance > LOW_BALANCE ? 'Available' : 'Low balance'}
                    </Badge>
                  </div>

                  <div className="student-balance-row">
                    <span className="student-balance-label">Wallet balance</span>
                    <strong className={`student-balance${balance <= LOW_BALANCE ? ' student-balance--low' : ''}`}>
                      {formatINR(balance)}
                    </strong>
                  </div>

                  {balance <= 0 && (
                    <Banner variant="alert" icon="⚠️" style={{ marginTop: 14 }}>
                      This wallet is empty. Top up at the school accounts counter.
                    </Banner>
                  )}

                  <div className="student-card-actions">
                    <Button to={`/child/${child._id}`} variant="dark" block>
                      View account <Icon name="chevronRight" size={17} />
                    </Button>
                    <Button to={`/purchase-password/${child._id}`} variant="ghost" block>
                      <Icon name="shield" size={17} /> Purchase code
                    </Button>
                  </div>
                </Card>
              </AnimateIn>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
