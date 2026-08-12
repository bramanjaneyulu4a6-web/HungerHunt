import { useEffect, useState } from 'react';
import API from '../services/api';
import { PUSH_EVENT } from '../utils/events';
import { AnimateIn, Banner, EmptyState, PageHeader, Skeleton, Card } from '../components/ui';
import PendingApprovalCard from '../components/PendingApprovalCard';

const DashboardSkeleton = () => (
  <>
    {[0, 1].map((item) => (
      <Card key={item} className="pending-card" style={{ marginBottom: 18 }}>
        <Skeleton width="42%" height={22} />
        <Skeleton width="65%" height={14} style={{ marginTop: 10 }} />
        <Skeleton height={54} style={{ marginTop: 24 }} />
      </Card>
    ))}
  </>
);

export default function Dashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);

  const reload = (message = '') => {
    if (message) setNotice(message);
    setLoading(true);
    setAttempt((value) => value + 1);
  };

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const response = await API.get('/pending-orders/parent');
        if (ignore) return;
        setOrders(response.data.orders || []);
        setError('');
      } catch (err) {
        if (ignore) return;
        setError(
          err.response?.data?.message ||
            "Couldn't load pending approvals. Check your connection."
        );
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();
    window.addEventListener(PUSH_EVENT, load);
    window.addEventListener('focus', load);
    return () => {
      ignore = true;
      window.removeEventListener(PUSH_EVENT, load);
      window.removeEventListener('focus', load);
    };
  }, [attempt]);

  return (
    <div className="page dashboard-page">
      <PageHeader
        title="Pending approvals"
        subtitle="Review purchases waiting for your approval across all linked students."
      />

      {notice && <Banner variant="success" icon="✅" style={{ marginBottom: 20 }}>{notice}</Banner>}
      {error && (
        <Banner variant="alert" icon="⚠️" style={{ marginBottom: 20 }}>
          {error}{' '}<button type="button" className="link-button" onClick={() => reload()}>Try again</button>
        </Banner>
      )}
      {loading && <DashboardSkeleton />}
      {!loading && !error && orders.length === 0 && (
        <EmptyState icon="✅" title="All caught up">
          There are no pending purchase approvals for any linked student.
        </EmptyState>
      )}
      {!loading && !error && orders.map((order, index) => (
        <AnimateIn key={order._id} index={index}>
          <PendingApprovalCard order={order} onResolved={reload} />
        </AnimateIn>
      ))}
    </div>
  );
}
