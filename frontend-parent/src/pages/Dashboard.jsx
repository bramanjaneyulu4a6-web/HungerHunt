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

  const fetchDashboard = async () => {
    try {
      const res = await API.get('/parent/dashboard');
      setChildren(res.data.children || []);
      setError('');
    } catch (err) {
      // Previously this only reached the console, so a failed load was
      // indistinguishable from a parent with no children linked.
      console.error('Error loading linked students:', err);
      setError("Couldn't load your children's accounts. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();

    // Balances change from recharges and purchases made elsewhere.
    const refresh = () => fetchDashboard();
    window.addEventListener(PUSH_EVENT, refresh);
    window.addEventListener('focus', refresh);

    return () => {
      window.removeEventListener(PUSH_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return (
    <div className="page">
      <PageHeader
        title="Linked Children Accounts"
        subtitle="Check the balance, purchases and recharges on each account"
      />

      {loading && <DashboardSkeleton />}

      {!loading && error && (
        <Banner variant="alert" icon="⚠️">
          {error}{' '}
          <button type="button" className="link-button" onClick={fetchDashboard}>
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
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '100%',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 12,
                      }}
                    >
                      <div>
                        <h2 className="card-title">{child.name}</h2>
                        <p className="card-meta">
                          Grade: {child.grade || 'N/A'} | Room:{' '}
                          {child.hostelNumber || 'N/A'}
                        </p>
                      </div>

                      {/* The glyph repeats what the colour says, so a low
                          balance still reads without green-vs-red vision. */}
                      <Badge variant={balance > LOW_BALANCE ? 'success' : 'alert'}>
                        <span aria-hidden="true">
                          {balance > LOW_BALANCE ? '✓' : '!'}
                        </span>
                        {formatINR(balance)}
                      </Badge>
                    </div>

                    {balance <= 0 && (
                      <Banner variant="alert" icon="⚠️" style={{ marginTop: 12 }}>
                        Balance exhausted. Please top up at the school accounts
                        counter.
                      </Banner>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <Button to={`/child/${child._id}`} variant="dark" block>
                      View Details
                    </Button>
                    <Button to={`/purchase-password/${child._id}`} block>
                      Set Password
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
